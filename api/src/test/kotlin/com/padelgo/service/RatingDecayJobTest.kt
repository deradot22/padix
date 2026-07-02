package com.padelgo.service

import com.padelgo.auth.UserAccount
import com.padelgo.auth.UserRepository
import com.padelgo.domain.Player
import com.padelgo.domain.RatingChange
import com.padelgo.domain.RatingChangeKind
import com.padelgo.repo.PlayerRepository
import com.padelgo.repo.RatingChangeRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Тест джоба decay: главный багфикс — ежедневные прогоны НЕ компаундятся.
 * Мокнутый rating_changes держится в изменяемом списке, чтобы проверить, что второй
 * прогон переписывает хвостовую decay-запись, а не добавляет вторую и не двигает рейтинг.
 */
class RatingDecayJobTest {

    private lateinit var playerRepo: PlayerRepository
    private lateinit var ratingChangeRepo: RatingChangeRepository
    private lateinit var userRepo: UserRepository
    private lateinit var job: RatingDecayJob

    private val now: Instant = Instant.parse("2026-07-02T03:00:00Z")
    private val aId = UUID.randomUUID()

    // Имитация таблицы rating_changes.
    private val changes = mutableListOf<RatingChange>()

    @BeforeEach
    fun setup() {
        playerRepo = mock()
        ratingChangeRepo = mock()
        userRepo = mock()
        job = RatingDecayJob(playerRepo, ratingChangeRepo, userRepo)

        whenever(userRepo.findAll()).doReturn(emptyList())
        whenever(ratingChangeRepo.save(any())).doAnswer { inv ->
            val c = inv.arguments[0] as RatingChange
            if (c.id == null) c.id = UUID.randomUUID()
            changes.add(c)
            c
        }
        whenever(ratingChangeRepo.delete(any())).doAnswer { inv ->
            changes.remove(inv.arguments[0] as RatingChange); null
        }
        whenever(playerRepo.save(any<Player>())).doAnswer { it.arguments[0] as Player }
        // Хвостовая запись = самая свежая; матчевая база = последняя с matchId != null.
        whenever(ratingChangeRepo.findFirstByPlayerIdOrderByCreatedAtDesc(aId))
            .doAnswer { changes.filter { it.playerId == aId }.maxByOrNull { it.createdAt ?: Instant.MIN } }
        whenever(ratingChangeRepo.findFirstByPlayerIdAndMatchIdIsNotNullOrderByCreatedAtDesc(aId))
            .doAnswer {
                changes.filter { it.playerId == aId && it.matchId != null }
                    .maxByOrNull { it.createdAt ?: Instant.MIN }
            }
    }

    @Test
    fun `decay job идемпотентен - повторный прогон не компаундится`() {
        // Игрок A: 1800, 50 игр, последний матч 200 дней назад → должен затухать.
        // Двое активных на 1100 тянут медиану-таргет к 1100.
        val a = Player(id = aId, name = "A", rating = 1800, gamesPlayed = 50).apply {
            lastMatchAt = now.minus(200, ChronoUnit.DAYS)
        }
        val b = Player(id = UUID.randomUUID(), name = "B", rating = 1100, gamesPlayed = 50).apply {
            lastMatchAt = now.minus(1, ChronoUnit.DAYS)
        }
        val c = Player(id = UUID.randomUUID(), name = "C", rating = 1100, gamesPlayed = 50).apply {
            lastMatchAt = now.minus(1, ChronoUnit.DAYS)
        }
        whenever(playerRepo.findAll()).doReturn(listOf(a, b, c))

        // Последний матч A зафиксирован записью matchId != null, newRating = 1800.
        changes.add(
            RatingChange(
                id = UUID.randomUUID(), eventId = UUID.randomUUID(), matchId = UUID.randomUUID(),
                kind = RatingChangeKind.MATCH, playerId = aId, oldRating = 1780, delta = 20, newRating = 1800,
                createdAt = now.minus(200, ChronoUnit.DAYS)
            )
        )

        // Прогон 1.
        job.applyDecay()
        val ratingAfter1 = a.rating
        val decayRecords1 = changes.count { it.playerId == aId && it.kind == RatingChangeKind.DECAY }
        assertTrue(ratingAfter1 < 1800, "рейтинг должен затухнуть: $ratingAfter1")
        assertEquals(1, decayRecords1, "ровно одна decay-запись")

        // Прогон 2 (тот же день, та же база) — не должно быть компаундинга.
        // createdAt decay-записи двигаем чуть назад, чтобы имитировать «прошлый прогон».
        changes.filter { it.kind == RatingChangeKind.DECAY }.forEach {
            it.createdAt = now.minus(1, ChronoUnit.HOURS)
        }
        job.applyDecay()
        val ratingAfter2 = a.rating
        val decayRecords2 = changes.count { it.playerId == aId && it.kind == RatingChangeKind.DECAY }

        assertEquals(ratingAfter1, ratingAfter2, "повторный прогон НЕ двигает рейтинг (нет компаундинга)")
        assertEquals(1, decayRecords2, "по-прежнему одна decay-запись (хвостовая переписана, не добавлена)")
        // База осталась 1800 (decay-запись matchId=null не влияет на baseline).
        assertEquals(1780 + 20, changes.first { it.kind == RatingChangeKind.MATCH }.newRating)
    }

    @Test
    fun `decay job не трогает активного игрока`() {
        val a = Player(id = aId, name = "A", rating = 1500, gamesPlayed = 50).apply {
            lastMatchAt = now.minus(10, ChronoUnit.DAYS)
        }
        whenever(playerRepo.findAll()).doReturn(listOf(a))
        changes.add(
            RatingChange(
                id = UUID.randomUUID(), eventId = UUID.randomUUID(), matchId = UUID.randomUUID(),
                kind = RatingChangeKind.MATCH, playerId = aId, oldRating = 1480, delta = 20, newRating = 1500,
                createdAt = now.minus(10, ChronoUnit.DAYS)
            )
        )
        job.applyDecay()
        assertEquals(1500, a.rating)
        assertEquals(0, changes.count { it.kind == RatingChangeKind.DECAY })
    }
}
