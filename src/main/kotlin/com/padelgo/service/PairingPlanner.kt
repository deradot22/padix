package com.padelgo.service

import java.util.UUID
import kotlin.math.abs

data class PlannedMatch(
    val courtNumber: Int,
    val teamA: Pair<UUID, UUID>,
    val teamB: Pair<UUID, UUID>
)

private data class PairKey(val a: UUID, val b: UUID) {
    companion object {
        fun of(x: UUID, y: UUID): PairKey = if (x < y) PairKey(x, y) else PairKey(y, x)
    }
}

/**
 * Простой планировщик для "Американки":
 * - минимизируем дисбаланс по сумме рейтингов команд
 * - штрафуем повторные партнёрства и частые встречи друг против друга
 * - слегка поощряем пары "сильный+слабый"
 *
 * Это не идеальный round-robin, но даёт хорошие сбалансированные корты и ротацию.
 */
class PairingPlanner(
    private val ratingByPlayer: Map<UUID, Int>,
    private val courtsCount: Int,
    private val pairingMode: com.padelgo.domain.PairingMode = com.padelgo.domain.PairingMode.ROUND_ROBIN,
    private val maxTeamDiff: Int? = null
) {
    private val partnerCounts = mutableMapOf<PairKey, Int>()
    private val opponentCounts = mutableMapOf<PairKey, Int>()
    private val playedRounds = mutableMapOf<UUID, Int>()
    private val courtCounts = mutableMapOf<UUID, MutableMap<Int, Int>>()

    fun planRounds(allPlayers: List<UUID>, rounds: Int): List<List<PlannedMatch>> {
        require(courtsCount > 0) { "courtsCount must be > 0" }
        val capacity = courtsCount * 4
        require(allPlayers.size >= capacity) { "Need at least $capacity players for $courtsCount courts" }

        val result = mutableListOf<List<PlannedMatch>>()
        repeat(rounds) {
            val selected = selectPlayersForRound(allPlayers, capacity)
            val matches = planSingleRound(selected)
            applyRoundStats(matches)
            result.add(matches)
        }
        return result
    }

    private fun selectPlayersForRound(allPlayers: List<UUID>, capacity: Int): List<UUID> {
        if (allPlayers.size == capacity) return allPlayers
        // Если игроков больше вместимости, даём приоритет тем, кто играл меньше раундов (чтобы бай были честными)
        return allPlayers
            .sortedWith(
                compareBy<UUID> { playedRounds[it] ?: 0 }
                    .thenByDescending { ratingByPlayer[it] ?: 1000 }
            )
            .take(capacity)
    }

    private fun planSingleRound(players: List<UUID>): List<PlannedMatch> {
        require(players.size % 4 == 0) { "Players for round must be multiple of 4" }
        val remaining = players
            .sortedByDescending { ratingByPlayer[it] ?: 1000 }
            .toMutableList()

        val matches = mutableListOf<PlannedMatch>()
        while (remaining.size >= 4 && matches.size < courtsCount) {
            val anchor = remaining.first()
            val others = remaining.drop(1)

            var best: PlannedMatch? = null
            var bestCost = Double.POSITIVE_INFINITY

            for (i in 0 until others.size - 2) {
                for (j in i + 1 until others.size - 1) {
                    for (k in j + 1 until others.size) {
                        val quad = listOf(anchor, others[i], others[j], others[k])
                        val (match, cost) = bestSplitForQuad(quad)
                        if (cost < bestCost) {
                            bestCost = cost
                            best = match
                        }
                    }
                }
            }

            val chosen = best ?: break
            matches.add(chosen)

            // remove used players
            remaining.remove(chosen.teamA.first)
            remaining.remove(chosen.teamA.second)
            remaining.remove(chosen.teamB.first)
            remaining.remove(chosen.teamB.second)
        }

        return assignCourts(matches)
    }

    private fun bestSplitForQuad(quad: List<UUID>): Pair<PlannedMatch, Double> {
        val a = quad[0]
        val b = quad[1]
        val c = quad[2]
        val d = quad[3]

        val candidates = listOf(
            PlannedMatch(1, teamA = a to b, teamB = c to d),
            PlannedMatch(1, teamA = a to c, teamB = b to d),
            PlannedMatch(1, teamA = a to d, teamB = b to c)
        )
        return candidates
            .map { it to cost(it) }
            .minBy { it.second }
    }

    private fun assignCourts(matches: List<PlannedMatch>): List<PlannedMatch> {
        if (matches.isEmpty()) return matches
        val available = (1..courtsCount).toMutableList()
        val ordered = matches.sortedByDescending { courtBias(it) }
        val result = mutableListOf<PlannedMatch>()
        ordered.forEach { m ->
            val bestCourt = available.minBy { courtCost(m, it) }
            result.add(m.copy(courtNumber = bestCourt))
            available.remove(bestCourt)
        }
        return result
    }

    private fun courtBias(m: PlannedMatch): Int {
        val players = listOf(m.teamA.first, m.teamA.second, m.teamB.first, m.teamB.second)
        return players.sumOf { p -> (courtCounts[p]?.values?.maxOrNull() ?: 0) }
    }

    private fun courtCost(m: PlannedMatch, court: Int): Int {
        val players = listOf(m.teamA.first, m.teamA.second, m.teamB.first, m.teamB.second)
        return players.sumOf { p -> courtCounts[p]?.get(court) ?: 0 }
    }

    private fun cost(m: PlannedMatch): Double {
        val ra1 = ratingByPlayer[m.teamA.first] ?: 1000
        val ra2 = ratingByPlayer[m.teamA.second] ?: 1000
        val rb1 = ratingByPlayer[m.teamB.first] ?: 1000
        val rb2 = ratingByPlayer[m.teamB.second] ?: 1000

        val teamASum = ra1 + ra2
        val teamBSum = rb1 + rb2
        val balance = abs(teamASum - teamBSum).toDouble()
        if (pairingMode == com.padelgo.domain.PairingMode.BALANCED && maxTeamDiff != null && balance > maxTeamDiff) {
            return balance + 1_000_000.0
        }

        val partnerPenalty = 5000.0 * (
            (partnerCounts[PairKey.of(m.teamA.first, m.teamA.second)] ?: 0) +
                (partnerCounts[PairKey.of(m.teamB.first, m.teamB.second)] ?: 0)
            )

        val oppPairs = listOf(
            PairKey.of(m.teamA.first, m.teamB.first),
            PairKey.of(m.teamA.first, m.teamB.second),
            PairKey.of(m.teamA.second, m.teamB.first),
            PairKey.of(m.teamA.second, m.teamB.second)
        )
        val opponentPenalty = 1000.0 * oppPairs.sumOf { opponentCounts[it] ?: 0 }

        // Поощряем "сильный + слабый" в команде (чем больше разница, тем меньше стоимость)
        val withinTeamDiff = abs(ra1 - ra2) + abs(rb1 - rb2)
        val withinBonus = -0.05 * withinTeamDiff

        return balance + partnerPenalty + opponentPenalty + withinBonus
    }

    private fun applyRoundStats(matches: List<PlannedMatch>) {
        matches.forEach { m ->
            inc(partnerCounts, PairKey.of(m.teamA.first, m.teamA.second))
            inc(partnerCounts, PairKey.of(m.teamB.first, m.teamB.second))

            listOf(
                PairKey.of(m.teamA.first, m.teamB.first),
                PairKey.of(m.teamA.first, m.teamB.second),
                PairKey.of(m.teamA.second, m.teamB.first),
                PairKey.of(m.teamA.second, m.teamB.second)
            ).forEach { inc(opponentCounts, it) }

            listOf(m.teamA.first, m.teamA.second, m.teamB.first, m.teamB.second)
                .forEach { playedRounds[it] = (playedRounds[it] ?: 0) + 1 }

            val players = listOf(m.teamA.first, m.teamA.second, m.teamB.first, m.teamB.second)
            players.forEach { p ->
                val map = courtCounts.getOrPut(p) { mutableMapOf() }
                map[m.courtNumber] = (map[m.courtNumber] ?: 0) + 1
            }
        }
    }

    private fun inc(map: MutableMap<PairKey, Int>, key: PairKey) {
        map[key] = (map[key] ?: 0) + 1
    }
}

