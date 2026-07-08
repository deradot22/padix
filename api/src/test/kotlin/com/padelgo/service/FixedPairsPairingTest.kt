package com.padelgo.service

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.util.UUID

/** Юнит-тесты round-robin между фиксированными парами (circle method). */
class FixedPairsPairingTest {

    private fun team() = UUID.randomUUID() to UUID.randomUUID()
    // Команду идентифицируем по первому игроку пары (в раунде она либо teamA, либо teamB).
    private fun teamKeyA(m: PlannedMatch) = m.teamA.first
    private fun teamKeyB(m: PlannedMatch) = m.teamB.first

    @Test
    fun `two teams — one round one match`() {
        val teams = List(2) { team() }
        val rounds = FixedPairsPairing.rounds(teams, courtsCount = 1)
        assertEquals(1, rounds.size)
        assertEquals(1, rounds[0].size)
        assertEquals(1, rounds[0][0].courtNumber)
    }

    @Test
    fun `four teams — full round robin, each pair meets once`() {
        val teams = List(4) { team() }
        val rounds = FixedPairsPairing.rounds(teams, courtsCount = 2)
        assertEquals(3, rounds.size, "n-1 раундов")
        rounds.forEach { assertEquals(2, it.size, "n/2 матчей в раунде") }

        // В каждом раунде все 4 команды заняты ровно раз (никто не играет дважды за раунд).
        rounds.forEach { round ->
            val teamsInRound = round.flatMap { listOf(teamKeyA(it), teamKeyB(it)) }.toSet()
            assertEquals(4, teamsInRound.size)
        }

        // Каждая пара команд встречается ровно один раз: C(4,2)=6 уникальных встреч.
        val meetings = rounds.flatten().map { setOf(teamKeyA(it), teamKeyB(it)) }
        assertEquals(6, meetings.size)
        assertEquals(6, meetings.toSet().size, "нет повторов встреч")
    }

    @Test
    fun `odd number of teams — bye rotation, all pairs meet once, none dropped`() {
        val teams = List(3) { team() } // нечётно → каждый круг один отдыхает, никого не выбрасываем
        val rounds = FixedPairsPairing.rounds(teams, courtsCount = 2)
        // C(3,2)=3 уникальные встречи; при bye в круге ровно 1 матч → 3 актуальных раунда.
        val meetings = rounds.flatten().map { setOf(teamKeyA(it), teamKeyB(it)) }
        assertEquals(3, meetings.size, "все 3 встречи сыграны")
        assertEquals(3, meetings.toSet().size, "нет повторов")
        // Каждая команда участвует ровно в 2 встречах (со всеми остальными).
        val perTeam = teams.map { t ->
            rounds.flatten().count { teamKeyA(it) == t.first || teamKeyB(it) == t.first }
        }
        assertEquals(listOf(2, 2, 2), perTeam)
    }

    @Test
    fun `more pairs than courts — circle round split into actual rounds, nothing dropped`() {
        val teams = List(6) { team() } // 6 пар на 1 корт: каждый круг 3 матча → делится на 3 раунда по 1
        val rounds = FixedPairsPairing.rounds(teams, courtsCount = 1)
        rounds.forEach { assertEquals(1, it.size, "не больше courtsCount матчей в раунде") }
        // Полный round-robin: C(6,2)=15 уникальных встреч, все сыграны без повторов.
        val meetings = rounds.flatten().map { setOf(teamKeyA(it), teamKeyB(it)) }
        assertEquals(15, meetings.size)
        assertEquals(15, meetings.toSet().size, "нет повторов встреч — ни одна пара не выброшена")
    }

    @Test
    fun `six pairs on three courts — each round fits courts, full round robin`() {
        val teams = List(6) { team() }
        val rounds = FixedPairsPairing.rounds(teams, courtsCount = 3)
        assertEquals(5, rounds.size, "n-1 кругов, каждый умещается в 3 корта")
        rounds.forEach { r ->
            assert(r.size <= 3)
            r.forEachIndexed { i, m -> assertEquals(i + 1, m.courtNumber) }
        }
        val meetings = rounds.flatten().map { setOf(teamKeyA(it), teamKeyB(it)) }.toSet()
        assertEquals(15, meetings.size)
    }
}
