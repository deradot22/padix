package com.padelgo.service

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * Тесты на алгоритм decay (затухания рейтинга при бездействии).
 *
 * Семантика после фикса 2026-07-02:
 *  - идемпотентность: расчёт от БАЗЫ (рейтинг на момент последнего матча), повторные
 *    ежедневные прогоны не компаундятся;
 *  - decay только ВНИЗ к target (бездействие не может поднять рейтинг);
 *  - cap 30% от (baseline − target);
 *  - target — медиана рейтингов опытных игроков (fallback 1500).
 */
class RatingDecayTest {

    private val now: Instant = Instant.parse("2026-05-14T12:00:00Z")
    private val target = 1200

    private fun daysAgo(days: Long): Instant = now.minus(days, ChronoUnit.DAYS)

    @Test
    fun `decay - null lastMatchAt не меняет рейтинг`() {
        assertEquals(1750, RatingDecay.decayedRating(1750, target, null, now))
    }

    @Test
    fun `decay - не применяется в первые 90 дней`() {
        assertEquals(1750, RatingDecay.decayedRating(1750, target, daysAgo(30), now))
        assertEquals(1750, RatingDecay.decayedRating(1750, target, daysAgo(89), now))
        assertEquals(1750, RatingDecay.decayedRating(1750, target, daysAgo(90), now))
    }

    @Test
    fun `decay - после 90 дней сдвигает рейтинг сильного игрока вниз`() {
        // 120 дней: 30 дней сверх лимита × 1 = -30
        assertEquals(1720, RatingDecay.decayedRating(1750, target, daysAgo(120), now))
    }

    @Test
    fun `decay - НЕ поднимает рейтинг слабого игрока`() {
        // Раньше drift вверх к 1500 выводил неиграющих в топ лидерборда.
        assertEquals(1100, RatingDecay.decayedRating(1100, target, daysAgo(365), now))
        assertEquals(target, RatingDecay.decayedRating(target, target, daysAgo(365), now))
    }

    @Test
    fun `decay - ограничен 30 процентами разницы с target`() {
        // baseline 1800, target 1200: gap = 600, max decay = 180
        assertEquals(1620, RatingDecay.decayedRating(1800, target, daysAgo(5000), now))
    }

    @Test
    fun `decay - идемпотентен - повторные прогоны от той же базы не компаундятся`() {
        // Старый баг: job применял функцию к уже задекеенному рейтингу, день за днём,
        // и рейтинг квадратично сходился к цели. Теперь база фиксирована — результат
        // зависит только от (baseline, days), сколько бы раз ни звали.
        val once = RatingDecay.decayedRating(1750, target, daysAgo(120), now)
        val again = RatingDecay.decayedRating(1750, target, daysAgo(120), now)
        assertEquals(once, again)

        // Симуляция 100 «ежедневных» прогонов: каждый прогон получает ту же базу 1750.
        var current = 1750
        for (day in 91L..190L) {
            current = RatingDecay.decayedRating(1750, target, daysAgo(day), now.plus(0, ChronoUnit.DAYS))
        }
        // День 190 → 100 дней сверх порога, cap 30%×550=165 не достигнут → 1750-100.
        assertEquals(1650, current)
    }

    @Test
    fun `decay - монотонно уменьшается с ростом дней неактивности до cap`() {
        val r100 = RatingDecay.decayedRating(1800, target, daysAgo(100), now)
        val r150 = RatingDecay.decayedRating(1800, target, daysAgo(150), now)
        val r200 = RatingDecay.decayedRating(1800, target, daysAgo(200), now)
        assertTrue(r100 > r150, "100д ($r100) > 150д ($r150)")
        assertTrue(r150 > r200, "150д ($r150) > 200д ($r200)")
    }

    // ============== targetRating ==============

    @Test
    fun `target - медиана опытных игроков`() {
        assertEquals(1200, RatingDecay.targetRating(listOf(1100, 1200, 1400)))
        // Устойчива к выбросу (мусорный аккаунт с 4000).
        assertEquals(1200, RatingDecay.targetRating(listOf(1100, 1150, 1200, 1300, 4000)))
    }

    @Test
    fun `target - fallback 1500 на пустой базе`() {
        assertEquals(RatingDecay.FALLBACK_TARGET, RatingDecay.targetRating(emptyList()))
    }
}
