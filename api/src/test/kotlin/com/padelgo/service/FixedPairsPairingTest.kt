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
    fun `odd number of teams — last dropped`() {
        val teams = List(3) { team() } // 2 корта = вместимость 4 пар, но 3 нечётно → отбрасываем до 2
        val rounds = FixedPairsPairing.rounds(teams, courtsCount = 2)
        assertEquals(1, rounds.size)
    }

    @Test
    fun `caps teams to courtsCount*2`() {
        val teams = List(10) { team() } // 2 корта → берём только 4 пар
        val rounds = FixedPairsPairing.rounds(teams, courtsCount = 2)
        assertEquals(3, rounds.size) // как для 4 команд
    }
}
