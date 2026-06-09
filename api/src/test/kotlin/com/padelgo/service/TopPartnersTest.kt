package com.padelgo.service

import com.padelgo.domain.Event
import com.padelgo.domain.Match
import com.padelgo.domain.MatchSetScore
import com.padelgo.domain.Player
import com.padelgo.domain.Round
import com.padelgo.repo.MatchSetScoreRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import java.util.UUID

/**
 * Юнит-тесты на [EventService.getTopPartners].
 * Все репозитории мокаются — проверяем чистую агрегацию win-rate по матчам.
 */
class TopPartnersTest {

    private val playerId = UUID.randomUUID()
    private val eventId = UUID.randomUUID()
    private val roundId = UUID.randomUUID()

    // Один общий event (SETS) и один round — все матчи висят на нём.
    private val event = Event(id = eventId).also { it.scoringMode = com.padelgo.domain.ScoringMode.SETS }
    private val round = Round(id = roundId, eventId = eventId, roundNumber = 1)

    private val matches = mutableListOf<Match>()
    private val scoresByMatch = mutableMapOf<UUID, List<MatchSetScore>>()
    private val partners = mutableMapOf<UUID, Player>()

    /** Создаёт матч: playerId + partner (команда A) против двух статистов; win=true → команда A победила. */
    private fun addMatch(partner: Player, win: Boolean) {
        val matchId = UUID.randomUUID()
        matches += Match(
            id = matchId,
            roundId = roundId,
            teamAPlayer1Id = playerId,
            teamAPlayer2Id = partner.id,
            teamBPlayer1Id = UUID.randomUUID(),
            teamBPlayer2Id = UUID.randomUUID()
        )
        scoresByMatch[matchId] = listOf(
            MatchSetScore(
                matchId = matchId,
                setNumber = 1,
                teamAGames = if (win) 6 else 4,
                teamBGames = if (win) 4 else 6
            )
        )
        partners[partner.id!!] = partner
    }

    private fun player(name: String) = Player(id = UUID.randomUUID(), name = name)

    private fun buildService(): EventService {
        val scoreRepo: MatchSetScoreRepository = mock()
        val matchRepo: com.padelgo.repo.MatchRepository = mock()
        val roundRepo: com.padelgo.repo.RoundRepository = mock()
        val eventRepo: com.padelgo.repo.EventRepository = mock()
        val playerRepo: com.padelgo.repo.PlayerRepository = mock()

        whenever(matchRepo.findAll()).thenReturn(matches)
        whenever(roundRepo.findAllById(any())).thenReturn(listOf(round))
        whenever(eventRepo.findAllById(any())).thenReturn(listOf(event))
        whenever(playerRepo.findAllById(any())).thenAnswer { inv ->
            @Suppress("UNCHECKED_CAST")
            val ids = inv.arguments[0] as Iterable<UUID>
            ids.mapNotNull { partners[it] }
        }
        scoresByMatch.forEach { (mid, sets) ->
            whenever(scoreRepo.findAllByMatchIdOrderBySetNumberAsc(mid)).thenReturn(sets)
        }

        return EventService(
            playerRepo = playerRepo,
            eventRepo = eventRepo,
            regRepo = mock(),
            roundRepo = roundRepo,
            matchRepo = matchRepo,
            scoreRepo = scoreRepo,
            draftScoreRepo = mock(),
            ratingChangeRepo = mock(),
            userRepo = mock(),
            inviteRepo = mock(),
            courtRepo = mock(),
            ratingNotificationRepo = mock(),
            botClient = mock(),
            seriesRepo = mock()
        )
    }

    @Test
    fun `пусто — у игрока нет матчей`() {
        val result = buildService().getTopPartners(playerId)
        assertTrue(result.isEmpty())
    }

    @Test
    fun `мало совместных игр — напарник отфильтрован`() {
        val enough = player("Хватает")   // 3 игры — проходит порог
        val notEnough = player("Мало")    // 2 игры — отсекается
        repeat(3) { addMatch(enough, win = true) }
        repeat(2) { addMatch(notEnough, win = true) }

        val result = buildService().getTopPartners(playerId)

        assertEquals(1, result.size)
        assertEquals(enough.id, result[0].player.id)
        assertEquals(3, result[0].gamesTogether)
        assertEquals(3, result[0].winsTogether)
        assertEquals(1.0, result[0].winRate)
    }

    @Test
    fun `нормальный ТОП-3 — сортировка по winRate, затем winsTogether`() {
        val x = player("X")  // 4 игры / 4 победы → wr 1.0, wins 4
        val w = player("W")  // 3 игры / 3 победы → wr 1.0, wins 3
        val y = player("Y")  // 3 игры / 2 победы → wr 0.667
        val z = player("Z")  // 5 игр / 2 победы → wr 0.4 (за бортом ТОП-3)

        repeat(4) { addMatch(x, win = true) }
        repeat(3) { addMatch(w, win = true) }
        addMatch(y, win = true); addMatch(y, win = true); addMatch(y, win = false)
        repeat(2) { addMatch(z, win = true) }; repeat(3) { addMatch(z, win = false) }

        val result = buildService().getTopPartners(playerId, limit = 3)

        assertEquals(3, result.size)
        // X и W оба 1.0, но у X больше совместных побед (4 > 3) → X выше.
        assertEquals(x.id, result[0].player.id)
        assertEquals(w.id, result[1].player.id)
        assertEquals(y.id, result[2].player.id)
        assertEquals(2, result[2].winsTogether)
        assertEquals(3, result[2].gamesTogether)
        assertTrue(result.none { it.player.id == z.id })
    }
}
