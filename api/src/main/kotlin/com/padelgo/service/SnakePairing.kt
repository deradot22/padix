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

    /**
     * Честный выбор играющих в следующем раунде Mexicano при переполнении состава.
     * В раунд идут игроки, сыгравшие МЕНЬШЕ раундов (при равенстве — выше по таблице);
     * результат возвращается в порядке таблицы [leaderboard] (для змейки 1+4 vs 2+3).
     *
     * Без этого аутсайдер таблицы сидел бы весь турнир: не играет → не набирает очков →
     * снова последний → снова на скамейке.
     */
    fun selectPlaying(
        leaderboard: List<UUID>,
        playedRounds: Map<UUID, Int>,
        capacity: Int
    ): List<UUID> {
        if (leaderboard.size <= capacity) return leaderboard
        val rank = leaderboard.withIndex().associate { (i, id) -> id to i }
        val selected = leaderboard
            .sortedWith(compareBy<UUID>({ playedRounds[it] ?: 0 }, { rank[it] ?: Int.MAX_VALUE }))
            .take(capacity)
            .toSet()
        return leaderboard.filter { it in selected }
    }
}
