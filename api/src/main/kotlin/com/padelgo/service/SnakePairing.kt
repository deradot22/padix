package com.padelgo.service

import java.util.UUID

/**
 * Чистая логика «змейки» для Mexicano и финального раунда: из упорядоченного
 * (лучший → худший) списка игроков формирует матчи 1+4 vs 2+3 по кортам.
 * Четвёрка a,b,c,d → команда a+d против b+c. Игроки сверх capacity (courtsCount*4)
 * в раунд не попадают. Логика вынесена отдельно, чтобы покрыть юнит-тестами без БД.
 */
object SnakePairing {
    fun round(ordered: List<UUID>, courtsCount: Int): List<PlannedMatch> {
        val capacity = courtsCount * 4
        return ordered.take(capacity).chunked(4).filter { it.size == 4 }.mapIndexed { idx, quad ->
            val (a, b, c, d) = quad
            PlannedMatch(courtNumber = idx + 1, teamA = a to d, teamB = b to c)
        }
    }
}
