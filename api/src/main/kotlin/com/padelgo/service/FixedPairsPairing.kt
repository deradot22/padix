package com.padelgo.service

import java.util.UUID

/**
 * Round-robin между фиксированными парами (формат FIXED_PAIRS), circle method.
 * Каждая пара играет против каждой другой ровно один раз.
 *
 * - Нечётное число пар → добавляется фиктивная BYE-пара: в каждом круге ровно одна
 *   реальная пара «отдыхает» (по очереди), а НЕ выбрасывается из турнира.
 * - Если матчей в круге больше, чем кортов (пар > courtsCount*2), круг разбивается на
 *   несколько актуальных раундов по courtsCount матчей — все пары играют полный
 *   round-robin, просто в разное время. Ничего не дропается молча.
 *
 * Логика вынесена отдельно, чтобы покрыть юнит-тестами без БД.
 */
object FixedPairsPairing {
    /** Фиктивная пара-«отдых» для нечётного числа команд. */
    private val BYE: Pair<UUID, UUID> = UUID(0L, 0L) to UUID(0L, 0L)
    private fun Pair<UUID, UUID>.isBye(): Boolean = first == BYE.first

    fun rounds(teams: List<Pair<UUID, UUID>>, courtsCount: Int): List<List<PlannedMatch>> {
        if (teams.size < 2) return emptyList()
        val courts = maxOf(1, courtsCount)

        // Нечётное число пар — добавляем фиктивную BYE-пару, чтобы каждый круг отдыхал ровно один.
        val work = teams.toMutableList()
        if (work.size % 2 != 0) work.add(BYE)
        val n = work.size // чётное

        // Circle method: позиция 0 фиксирована, позиции 1..n-1 вращаются. n-1 кругов.
        val idx = (0 until n).toMutableList()
        val result = mutableListOf<List<PlannedMatch>>()
        repeat(n - 1) {
            // Реальные пары круга (пропускаем матч с BYE — эта пара отдыхает).
            val circlePairs = (0 until n / 2).mapNotNull { i ->
                val a = work[idx[i]]
                val b = work[idx[n - 1 - i]]
                if (a.isBye() || b.isBye()) null else a to b
            }
            // Больше матчей, чем кортов — разбиваем круг на несколько актуальных раундов.
            circlePairs.chunked(courts).forEach { chunk ->
                result.add(chunk.mapIndexed { court, (a, b) ->
                    PlannedMatch(courtNumber = court + 1, teamA = a, teamB = b)
                })
            }
            val last = idx.removeAt(n - 1)
            idx.add(1, last)
        }
        return result
    }
}
