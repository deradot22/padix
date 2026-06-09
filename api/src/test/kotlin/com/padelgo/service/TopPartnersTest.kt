package com.padelgo.service

import com.padelgo.auth.UserAccount
import com.padelgo.domain.Event
import com.padelgo.domain.Match
import com.padelgo.domain.MatchSetScore
import com.padelgo.domain.Player
import com.padelgo.domain.Round
import com.padelgo.repo.MatchSetScoreRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import java.time.LocalDate
import java.util.UUID

/**
 * Юнит-тесты на [EventService.getTopPartners].
 * Все репозитории мокаются — проверяем агрегацию и ранжирование по нижней границе Уилсона,
 * а также фильтры «только откалиброванные» и «активные за последние 60 дней».
 */
class TopPartnersTest {

    // Фиксированная «сегодня» — чтобы фильтр активности был детерминированным.
    private val today = LocalDate.of(2026, 6, 9)

    private val playerId = UUID.randomUUID()

    private val matches = mutableListOf<Match>()
    private val scoresByMatch = mutableMapOf<UUID, List<MatchSetScore>>()
    private val rounds = mutableMapOf<UUID, Round>()
    private val events = mutableMapOf<UUID, Event>()
    private val partners = mutableMapOf<UUID, Player>()

    // playerId напарника -> остаток калибровочных матчей. null = у напарника нет аккаунта (UserAccount).
    // 0 = полностью откалиброван (по умолчанию для всех добавленных напарников).
    private val calibrationRemaining = mutableMapOf<UUID, Int?>()

    /**
     * Создаёт матч: playerId + partner (команда A) против двух статистов.
     * win=true → команда A победила. daysAgo — сколько дней назад сыгран матч (для фильтра активности).
     * Каждый матч кладётся в собственный event с нужной датой.
     */
    private fun addMatch(partner: Player, win: Boolean, daysAgo: Long = 0) {
        val matchId = UUID.randomUUID()
        val eventId = UUID.randomUUID()
        val roundId = UUID.randomUUID()
        events[eventId] = Event(id = eventId).also {
            it.scoringMode = com.padelgo.domain.ScoringMode.SETS
            it.date = today.minusDays(daysAgo)
        }
        rounds[roundId] = Round(id = roundId, eventId = eventId, roundNumber = 1)
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
        calibrationRemaining.putIfAbsent(partner.id!!, 0)  // по умолчанию откалиброван
    }

    /** Помечает напарника как ещё калибрующегося (остался [remaining] матч(ей)) или без аккаунта (null). */
    private fun setCalibration(partner: Player, remaining: Int?) {
        calibrationRemaining[partner.id!!] = remaining
    }

    private fun player(name: String) = Player(id = UUID.randomUUID(), name = name)

    private fun buildService(): EventService {
        val scoreRepo: MatchSetScoreRepository = mock()
        val matchRepo: com.padelgo.repo.MatchRepository = mock()
        val roundRepo: com.padelgo.repo.RoundRepository = mock()
        val eventRepo: com.padelgo.repo.EventRepository = mock()
        val playerRepo: com.padelgo.repo.PlayerRepository = mock()
        val userRepo: com.padelgo.auth.UserRepository = mock()

        // Все матчи в тестах включают playerId (команда A) — выборка по игроку возвращает их все.
        whenever(matchRepo.findAllByPlayerParticipating(any())).thenReturn(matches)
        whenever(roundRepo.findAllById(any())).thenAnswer { inv ->
            @Suppress("UNCHECKED_CAST")
            val ids = inv.arguments[0] as Iterable<UUID>
            ids.mapNotNull { rounds[it] }
        }
        whenever(eventRepo.findAllById(any())).thenAnswer { inv ->
            @Suppress("UNCHECKED_CAST")
            val ids = inv.arguments[0] as Iterable<UUID>
            ids.mapNotNull { events[it] }
        }
        whenever(playerRepo.findAllById(any())).thenAnswer { inv ->
            @Suppress("UNCHECKED_CAST")
            val ids = inv.arguments[0] as Iterable<UUID>
            ids.mapNotNull { partners[it] }
        }
        whenever(userRepo.findAllByPlayerIdIn(any())).thenAnswer { inv ->
            @Suppress("UNCHECKED_CAST")
            val ids = inv.arguments[0] as Iterable<UUID>
            ids.mapNotNull { pid ->
                // null в calibrationRemaining → аккаунта нет, UserAccount не возвращаем
                calibrationRemaining[pid]?.let { rem ->
                    UserAccount(playerId = pid, calibrationMatchesRemaining = rem)
                }
            }
        }
        // Батч-загрузка счёта: сервис сам сгруппирует по matchId.
        whenever(scoreRepo.findAllByMatchIdInOrderBySetNumberAsc(any()))
            .thenReturn(scoresByMatch.values.flatten())

        return EventService(
            playerRepo = playerRepo,
            eventRepo = eventRepo,
            regRepo = mock(),
            roundRepo = roundRepo,
            matchRepo = matchRepo,
            scoreRepo = scoreRepo,
            draftScoreRepo = mock(),
            ratingChangeRepo = mock(),
            userRepo = userRepo,
            inviteRepo = mock(),
            courtRepo = mock(),
            ratingNotificationRepo = mock(),
            botClient = mock(),
            seriesRepo = mock()
        )
    }

    private fun run(limit: Int = EventService.DEFAULT_TOP_PARTNERS_LIMIT) =
        buildService().getTopPartners(playerId, limit, today)

    @Test
    fun `пусто — у игрока нет матчей`() {
        assertTrue(run().isEmpty())
    }

    @Test
    fun `мало совместных игр — напарник отфильтрован`() {
        val enough = player("Хватает")   // 3 игры — проходит порог
        val notEnough = player("Мало")    // 2 игры — отсекается
        repeat(3) { addMatch(enough, win = true) }
        repeat(2) { addMatch(notEnough, win = true) }

        val result = run()

        assertEquals(1, result.size)
        assertEquals(enough.id, result[0].player.id)
        assertEquals(3, result[0].gamesTogether)
        assertEquals(3, result[0].winsTogether)
        assertEquals(1.0, result[0].winRate)
    }

    @Test
    fun `неоткалиброванные напарники исключаются`() {
        val calibrated = player("Готов")        // откалиброван (0)
        val calibrating = player("Калибруется") // остался 2 калибровочных матча
        val noAccount = player("БезАккаунта")    // UserAccount отсутствует
        repeat(3) { addMatch(calibrated, win = true) }
        repeat(3) { addMatch(calibrating, win = true) }
        repeat(3) { addMatch(noAccount, win = true) }
        setCalibration(calibrating, 2)
        setCalibration(noAccount, null)

        val result = run()

        assertEquals(1, result.size)
        assertEquals(calibrated.id, result[0].player.id)
        assertFalse(result.any { it.player.id == calibrating.id })
        assertFalse(result.any { it.player.id == noAccount.id })
    }

    @Test
    fun `неактивный напарник — последняя игра больше 60 дней назад — исключается`() {
        val active = player("Активный")     // 3 свежие победы
        val stale = player("Давний")        // идеальные статы, но последняя игра 6 месяцев назад
        repeat(3) { addMatch(active, win = true, daysAgo = 10) }
        repeat(5) { addMatch(stale, win = true, daysAgo = 180) }

        val result = run()

        assertEquals(1, result.size)
        assertEquals(active.id, result[0].player.id)
        assertFalse(result.any { it.player.id == stale.id })
    }

    @Test
    fun `граница активности — ровно 60 дней назад ещё считается активным`() {
        val edge = player("Граница")
        repeat(3) { addMatch(edge, win = true, daysAgo = EventService.RECENT_DAYS) }

        val result = run()

        assertEquals(1, result.size)
        assertEquals(edge.id, result[0].player.id)
    }

    @Test
    fun `ранжирование по балансу качества и наигранности, затем gamesTogether`() {
        val x = player("X")  // 4 игры / 4 победы → score 6.32
        val w = player("W")  // 3 игры / 3 победы → score 5.00
        val y = player("Y")  // 3 игры / 2 победы → score 3.50
        val z = player("Z")  // 5 игр / 2 победы → score 3.09 (за бортом ТОП-3)

        repeat(4) { addMatch(x, win = true) }
        repeat(3) { addMatch(w, win = true) }
        addMatch(y, win = true); addMatch(y, win = true); addMatch(y, win = false)
        repeat(2) { addMatch(z, win = true) }; repeat(3) { addMatch(z, win = false) }

        val result = run(limit = 3)

        assertEquals(3, result.size)
        // X и W оба winRate 1.0, но у X больше совместных побед → балл выше → X впереди.
        assertEquals(x.id, result[0].player.id)
        assertEquals(w.id, result[1].player.id)
        assertEquals(y.id, result[2].player.id)
        assertEquals(2, result[2].winsTogether)
        assertEquals(3, result[2].gamesTogether)
        // score строго убывает по списку.
        assertTrue(result[0].score > result[1].score)
        assertTrue(result[1].score > result[2].score)
        assertTrue(result.none { it.player.id == z.id })
    }

    @Test
    fun `наигранность поднимает частого напарника выше редкого, но провального частого — нет`() {
        val frequent = player("Частый")  // 20 игр / 13 побед (65%) → score 13.89
        val rare = player("Редкий")      // 9 игр / 7 побед (78%)   → score 9.32
        val bad = player("Провальный")   // 30 игр / 12 побед (40%) → score 7.95
        repeat(13) { addMatch(frequent, win = true) }; repeat(7) { addMatch(frequent, win = false) }
        repeat(7) { addMatch(rare, win = true) }; repeat(2) { addMatch(rare, win = false) }
        repeat(12) { addMatch(bad, win = true) }; repeat(18) { addMatch(bad, win = false) }

        val result = run(limit = 3)

        assertEquals(3, result.size)
        // Частый напарник (65%) обходит редкого (78%) — наигранность перевешивает разницу в проценте...
        assertEquals(frequent.id, result[0].player.id)
        assertEquals(rare.id, result[1].player.id)
        // ...но провальный частый (40% на 30 играх) остаётся внизу из-за штрафа за поражения.
        assertEquals(bad.id, result[2].player.id)
        assertTrue(result[0].winRate < result[1].winRate) // 0.65 < 0.78 — да, % у победителя ниже
        assertTrue(result[0].score > result[1].score)
        assertTrue(result[1].score > result[2].score)
    }
}
