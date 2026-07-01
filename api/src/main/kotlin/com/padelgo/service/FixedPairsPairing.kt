package com.padelgo.service

import java.util.UUID

/**
 * Round-robin между фиксированными парами (формат FIXED_PAIRS), circle method.
 * Каждая пара играет против каждой другой ровно один раз. Берётся не больше
 * courtsCount*2 пар (столько помещается на корты одновременно, по паре-vs-паре на корт).
 * Для полного round-robin нужно чётное число пар; лишнюю (нечётную) отбрасываем.
 * Логика вынесена отдельно, чтобы покрыть юнит-тестами без БД.
 */
object FixedPairsPairing {
    fun rounds(teams: List<Pair<UUID, UUID>>, courtsCount: Int): List<List<PlannedMatch>> {
        val capacityTeams = courtsCount * 2
        val list = teams.take(capacityTeams).let { if (it.size % 2 != 0) it.dropLast(1) else it }
        val n = list.size
        if (n < 2) return emptyList()

        // circle method: позиция 0 фиксирована, позиции 1..n-1 вращаются.
        val idx = (0 until n).toMutableList()
        val result = mutableListOf<List<PlannedMatch>>()
        repeat(n - 1) {
            val roundMatches = (0 until n / 2).map { i ->
                PlannedMatch(
                    courtNumber = i + 1,
                    teamA = list[idx[i]],
                    teamB = list[idx[n - 1 - i]]
                )
            }
            result.add(roundMatches)
            val last = idx.removeAt(n - 1)
            idx.add(1, last)
        }
        return result
    }
}
