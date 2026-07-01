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
}
