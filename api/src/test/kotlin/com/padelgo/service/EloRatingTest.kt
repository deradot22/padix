package com.padelgo.service

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Формула v2 (2026-10): делитель 300, рейтинг пары — среднее, половина дельты за исход и
 * половина за долю очков с логистическим ожиданием, победитель не уходит в минус.
 */
class EloRatingTest {
    private val k = 32.0

    @Test
    fun `teamRating - среднее, порядок аргументов не важен`() {
        assertEquals(1700, EloRating.teamRating(1700, 1700))
        assertEquals(1600, EloRating.teamRating(1800, 1400))
        assertEquals(1600, EloRating.teamRating(1400, 1800))
        assertEquals(1551, EloRating.teamRating(1600, 1501))
    }

    @Test
    fun `expectedScore - делитель 300 - разрыв 300 это 91 процент`() {
        assertEquals(0.5, EloRating.expectedScore(1500, 1500), 1e-9)
        assertEquals(0.909, EloRating.expectedScore(1800, 1500), 0.001)
        assertEquals(0.849, EloRating.expectedScore(1725, 1500), 0.001)
        assertEquals(1.0, EloRating.expectedScore(1500, 1800) + EloRating.expectedScore(1800, 1500), 1e-9)
    }

    @Test
    fun `expectedShare - доля очков сжата к половине - разрыв 300 это 62 процента очков`() {
        assertEquals(0.5, EloRating.expectedShare(1500, 1500), 1e-9)
        assertEquals(0.62, EloRating.expectedShare(1800, 1500), 0.005)
        assertEquals(0.84, EloRating.expectedShare(2500, 1500), 0.005)
    }

    @Test
    fun `teamDelta - равные пары - счёт различает 13 к 11 и 20 к 4`() {
        assertEquals(10.0, EloRating.teamDelta(1500, 1500, k, 1.0, 13, 11), 0.01)
        assertEquals(24.0, EloRating.teamDelta(1500, 1500, k, 1.0, 20, 4), 0.01)
        assertEquals(0.0, EloRating.teamDelta(1500, 1500, k, 0.5, 12, 12), 1e-9)
    }

    @Test
    fun `teamDelta - антисимметричен для обеих сторон матча`() {
        val dA = EloRating.teamDelta(1600, 1400, k, 1.0, 15, 9)
        val dB = EloRating.teamDelta(1400, 1600, k, 0.0, 9, 15)
        assertEquals(dA, -dB, 1e-9)
    }

    @Test
    fun `teamDelta - апсет даёт почти полный K, победа фаворита мало`() {
        val upset = EloRating.teamDelta(1300, 1700, 20.0, 1.0, 16, 8)
        assertTrue(upset > 18.0, "апсет: $upset")
        val favorite = EloRating.teamDelta(1700, 1300, 20.0, 1.0, 16, 8)
        assertTrue(favorite in 0.0..2.0, "фаворит: $favorite")
    }

    @Test
    fun `teamDelta - победитель не уходит в минус, проигравший не уходит в плюс`() {
        // Разрыв 700: фаворит обязан брать ≈ 76 % очков; 15:9 — меньше, но это победа.
        assertEquals(0.0, EloRating.teamDelta(1700, 1000, k, 1.0, 15, 9), 1e-9)
        assertEquals(0.0, EloRating.teamDelta(1000, 1700, k, 0.0, 9, 15), 1e-9)
    }

    @Test
    fun `teamDelta - на слабых не фармят - 2000 против 1000 за разгром даёт мало`() {
        val shutout = EloRating.teamDelta(2000, 1000, k, 1.0, 24, 0)
        assertTrue(shutout > 0.0 && shutout < 8.0, "24:0 при разрыве 1000: $shutout")
        assertEquals(0.0, EloRating.teamDelta(2000, 1000, k, 1.0, 20, 4), 1e-9)
        // А поражение стоит полный шаг.
        val loss = EloRating.teamDelta(2000, 1000, k, 0.0, 11, 13)
        assertTrue(loss < -24.0, "поражение фаворита: $loss")
    }

    @Test
    fun `teamDelta - дробная, мелкие дельты не схлопываются в ноль`() {
        val d = EloRating.teamDelta(1500, 1500, 20.0, 1.0, 13, 11)
        assertEquals(6.25, d, 0.01)
    }

    @Test
    fun `teamDelta - без очков считается только исход`() {
        assertEquals(k * 0.25, EloRating.teamDelta(1500, 1500, k, 1.0, 0, 0), 1e-9)
    }
}
