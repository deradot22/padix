package com.padelgo.service

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue

/**
 * Тесты на три новых правила:
 * 1) teamRating — взвешенное среднее 60/40 в пользу слабого
 * 2) marginMultiplier — квадратичная кривая до 1.5x
 * 3) (decay тестируется отдельно в RatingDecayTest)
 */
class EloRatingTest {

    // ============== teamRating ==============

    @Test
    fun `teamRating - равные игроки = их рейтинг`() {
        assertEquals(1700, EloRating.teamRating(1700, 1700))
        assertEquals(1500, EloRating.teamRating(1500, 1500))
    }

    @Test
    fun `teamRating - 60_40 с уклоном к слабому`() {
        // 1800 + 1400: weaker=1400, stronger=1800
        // 1400*0.6 + 1800*0.4 = 840 + 720 = 1560
        assertEquals(1560, EloRating.teamRating(1800, 1400))
        // Должна быть симметрия — порядок аргументов не важен
        assertEquals(1560, EloRating.teamRating(1400, 1800))
    }

    @Test
    fun `teamRating - сильный разрыв новичок плюс топ`() {
        // 2000 + 1000: 1000*0.6 + 2000*0.4 = 600 + 800 = 1400
        assertEquals(1400, EloRating.teamRating(2000, 1000))
        // Это сильно ниже среднего 1500 — справедливо
    }

    @Test
    fun `teamRating - слабее обычного среднего для смешанной команды`() {
        // 1600 + 1500: 1500*0.6 + 1600*0.4 = 900 + 640 = 1540
        // (а обычное среднее = 1550)
        val weighted = EloRating.teamRating(1600, 1500)
        val avg = (1600 + 1500) / 2
        assertTrue(weighted < avg, "weighted=$weighted должен быть меньше avg=$avg")
        assertEquals(1540, weighted)
    }

    // ============== teamDelta ==============

    @Test
    fun `teamDelta - равные команды - половина K за победу`() {
        // expected = 0.5 → delta = K × 0.5
        assertEquals(10.0, EloRating.teamDelta(1500, 1500, 20.0, 1.0), 0.001)
        assertEquals(-10.0, EloRating.teamDelta(1500, 1500, 20.0, 0.0), 0.001)
        assertEquals(0.0, EloRating.teamDelta(1500, 1500, 20.0, 0.5), 0.001)
    }

    @Test
    fun `teamDelta - апсет даёт больше, победа фаворита меньше`() {
        // Разрыв 400: expected(слабые) ≈ 0.0909
        val upset = EloRating.teamDelta(1300, 1700, 20.0, 1.0)
        assertEquals(20.0 * (1 - 1.0 / 11.0), upset, 0.01)
        val favorite = EloRating.teamDelta(1700, 1300, 20.0, 1.0)
        assertTrue(favorite < 2.0, "фаворит за победу получает мало: $favorite")
        assertTrue(upset > 18.0, "апсет даёт почти полный K: $upset")
    }

    @Test
    fun `teamDelta - дробная - мелкие дельты не схлопываются в ноль`() {
        // Разрыв 640: раньше roundToInt внутри давал 0 → margin умножал ноль.
        val d = EloRating.teamDelta(2140, 1500, 20.0, 1.0)
        assertTrue(d > 0.0 && d < 1.0, "дробная дельта сохраняется: $d")
    }

    @Test
    fun `teamDelta - антисимметричен`() {
        val dA = EloRating.teamDelta(1600, 1400, 32.0, 1.0)
        val dB = EloRating.teamDelta(1400, 1600, 32.0, 0.0)
        assertEquals(dA, -dB, 0.001)
    }

    // ============== marginMultiplier ==============

    @Test
    fun `marginMultiplier - близкая игра почти без буста`() {
        // 13 vs 11, total=24, margin=2, ratio=2/24≈0.083
        // mult = 1 + 0.5 * 0.083^2 = 1.0035
        val m = EloRating.marginMultiplier(13, 11, 24)
        assertTrue(m >= 1.0 && m <= 1.01, "margin=$m должен быть около 1.0")
    }

    @Test
    fun `marginMultiplier - средний разгром 16 to 8`() {
        // margin=8, ratio=8/24≈0.333, mult = 1 + 0.5 * 0.111 = 1.056
        val m = EloRating.marginMultiplier(16, 8, 24)
        assertTrue(m in 1.05..1.06, "margin=$m должен быть около 1.056")
    }

    @Test
    fun `marginMultiplier - сильный разгром 22 to 2`() {
        // margin=20, ratio=20/24≈0.833, mult = 1 + 0.5 * 0.694 = 1.347
        val m = EloRating.marginMultiplier(22, 2, 24)
        assertTrue(m in 1.34..1.35, "margin=$m должен быть около 1.347")
    }

    @Test
    fun `marginMultiplier - полный шат-аут 24 to 0`() {
        // margin=24, ratio=1.0, mult = 1 + 0.5 * 1.0 = 1.5 (максимум)
        val m = EloRating.marginMultiplier(24, 0, 24)
        assertEquals(1.5, m, 0.001)
    }

    @Test
    fun `marginMultiplier - не превышает 1_5 даже при margin больше total`() {
        // Невозможный кейс защищён clamp: ratio≤1
        val m = EloRating.marginMultiplier(30, 0, 24)
        assertEquals(1.5, m, 0.001)
    }

    @Test
    fun `marginMultiplier - ноль если expectedTotal равен нулю`() {
        // Защита от деления на 0 — fallback на 1.0
        assertEquals(1.0, EloRating.marginMultiplier(10, 0, 0), 0.001)
    }

    @Test
    fun `marginMultiplier - симметричен по знаку margin`() {
        // Не важно кто выиграл — multiplier тот же
        assertEquals(
            EloRating.marginMultiplier(20, 4, 24),
            EloRating.marginMultiplier(4, 20, 24),
            0.001
        )
    }
}
