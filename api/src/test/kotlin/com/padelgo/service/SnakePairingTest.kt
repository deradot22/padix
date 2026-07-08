package com.padelgo.service

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.util.UUID

/** Юнит-тесты змейки Mexicano/финального раунда (1+4 vs 2+3). */
class SnakePairingTest {

    private fun ids(n: Int) = (1..n).map { UUID.randomUUID() }

    @Test
    fun `single court pairs 1+4 vs 2+3`() {
        val p = ids(4)
        val matches = SnakePairing.round(p, courtsCount = 1)
        assertEquals(1, matches.size)
        val m = matches[0]
        assertEquals(1, m.courtNumber)
        assertEquals(setOf(p[0], p[3]), setOf(m.teamA.first, m.teamA.second), "teamA должна быть 1+4")
        assertEquals(setOf(p[1], p[2]), setOf(m.teamB.first, m.teamB.second), "teamB должна быть 2+3")
    }

    @Test
    fun `two courts snake each quad by court`() {
        val p = ids(8)
        val matches = SnakePairing.round(p, courtsCount = 2)
        assertEquals(2, matches.size)
        assertEquals(setOf(p[0], p[3]), setOf(matches[0].teamA.first, matches[0].teamA.second))
        assertEquals(setOf(p[1], p[2]), setOf(matches[0].teamB.first, matches[0].teamB.second))
        assertEquals(setOf(p[4], p[7]), setOf(matches[1].teamA.first, matches[1].teamA.second))
        assertEquals(setOf(p[5], p[6]), setOf(matches[1].teamB.first, matches[1].teamB.second))
    }

    @Test
    fun `players beyond capacity sit out`() {
        val p = ids(6) // 1 корт → вместимость 4, двое отдыхают
        val matches = SnakePairing.round(p, courtsCount = 1)
        assertEquals(1, matches.size)
        val used = matches.flatMap { listOf(it.teamA.first, it.teamA.second, it.teamB.first, it.teamB.second) }.toSet()
        assertEquals(setOf(p[0], p[1], p[2], p[3]), used, "в раунд берутся первые 4 из упорядоченного списка")
    }

    @Test
    fun `incomplete quad is dropped`() {
        val p = ids(6) // 2 корта нужно 8 игроков; из 6 полноценная четвёрка одна
        val matches = SnakePairing.round(p, courtsCount = 2)
        assertEquals(1, matches.size)
    }

    // ============== selectPlaying — честная скамейка ==============

    @Test
    fun `selectPlaying — состав в пределах вместимости не режется`() {
        val p = ids(4)
        val played = p.associateWith { 0 }
        assertEquals(p, SnakePairing.selectPlaying(p, played, capacity = 4))
    }

    @Test
    fun `selectPlaying — аутсайдер, сыгравший меньше, попадает в раунд`() {
        // 5 игроков, 1 корт (вместимость 4). p0..p3 сыграли по 1 раунду, p4 (последний
        // в таблице) сидел — 0 раундов. Он ДОЛЖЕН войти, вытеснив самого слабого из сыгравших.
        val p = ids(5)
        val played = mapOf(p[0] to 1, p[1] to 1, p[2] to 1, p[3] to 1, p[4] to 0)
        val playing = SnakePairing.selectPlaying(p, played, capacity = 4)
        assertEquals(4, playing.size)
        assert(p[4] in playing) { "просидевший раунд аутсайдер обязан сыграть в следующем" }
        // Возвращается в порядке таблицы (для змейки).
        assertEquals(playing, p.filter { it in playing.toSet() })
    }

    @Test
    fun `selectPlaying — никто не застревает на скамейке за 5 раундов`() {
        // 5 игроков, 1 корт: за несколько раундов каждый должен сыграть примерно поровну.
        val p = ids(5)
        val played = p.associateWith { 0 }.toMutableMap()
        // Имитируем таблицу: порядок фиксирован (по индексу). Прогоняем 5 раундов.
        repeat(5) {
            val playing = SnakePairing.selectPlaying(p, played, capacity = 4)
            playing.forEach { played[it] = (played[it] ?: 0) + 1 }
        }
        val counts = p.map { played[it]!! }
        val spread = counts.max() - counts.min()
        assert(spread <= 1) { "за 5 раундов разброс сыгранного должен быть ≤1, а он $spread ($counts)" }
    }
}
