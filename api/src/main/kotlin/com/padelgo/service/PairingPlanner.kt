package com.padelgo.service

import com.padelgo.domain.Match
import java.util.UUID
import kotlin.math.abs
import kotlin.random.Random

data class PlannedMatch(
    val courtNumber: Int,
    val teamA: Pair<UUID, UUID>,
    val teamB: Pair<UUID, UUID>
)

/**
 * Бюджет узлов DFS для поиска раунда без повторов партнёрств (4+ кортов).
 * Ограничение «обе пары матча ещё не играли вместе» само по себе режет дерево
 * на порядки; бюджет — страховка от патологических случаев на больших составах.
 */
private const val NO_REPEAT_NODE_BUDGET = 300_000

private data class PairKey(val a: UUID, val b: UUID) {
    companion object {
        fun of(x: UUID, y: UUID): PairKey = if (x < y) PairKey(x, y) else PairKey(y, x)
    }
}

/**
 * Lexicographic round cost. Сравнивается ПО УРОВНЯМ — нижестоящие критерии
 * учитываются только при равенстве вышестоящих. Так штрафы не «съедают» друг друга.
 */
private data class RoundCost(
    val partnerRepeats: Int,     // ↓ суммарно повторов партнёрств в раунде
    val opponentRepeats: Int,    // ↓ суммарно повторов соперничеств
    val balanceViolations: Int,  // ↓ матчей с balance > cap (только BALANCED)
    val totalBalance: Int,       // ↓ сумма |teamA−teamB| по всем матчам
    val courtRepeats: Int,       // ↓ повторов игрока на одном корте
    val withinPenalty: Int,      // ↓ −withinBonus (сильный+слабый: разница в команде → меньше)
    val tieBreak: Int            // ↓ случайный шум, чтоб одинаковые планы перемешивались
) {
    operator fun plus(other: RoundCost): RoundCost = RoundCost(
        partnerRepeats + other.partnerRepeats,
        opponentRepeats + other.opponentRepeats,
        balanceViolations + other.balanceViolations,
        totalBalance + other.totalBalance,
        courtRepeats + other.courtRepeats,
        withinPenalty + other.withinPenalty,
        tieBreak + other.tieBreak
    )

    companion object {
        val ZERO = RoundCost(0, 0, 0, 0, 0, 0, 0)

        /** ROUND_ROBIN: сначала ротация (партнёры → соперники), потом баланс. */
        val ROTATION_FIRST: Comparator<RoundCost> = compareBy(
            { it.partnerRepeats },
            { it.opponentRepeats },
            { it.balanceViolations },
            { it.totalBalance },
            { it.courtRepeats },
            { it.withinPenalty },
            { it.tieBreak }
        )

        /**
         * BALANCED: ротация партнёров ПЕРВИЧНА, cap — сразу за ней, соперники — выше
         * тонкого баланса.
         *
         * История двух залипаний:
         * 1) totalBalance вторым (до 2026-06) — алгоритм крутил одни и те же 4 пары
         *    с минимальным перекосом много раундов подряд;
         * 2) balanceViolations первым (до 2026-07-03) — при разнородных рейтингах
         *    единственный способ уложиться в cap — пары «сильный+слабый», и алгоритм
         *    НЕ разлучал их весь эвент (прод-кейс 17.05: две пары вместе все 7 раундов).
         *
         * Смысл BALANCED теперь: «не повторяем партнёров; среди таких раундов — не
         * допускаем перекошенных матчей (cap); дальше ротация соперников и тонкий баланс».
         */
        val BALANCE_FIRST: Comparator<RoundCost> = compareBy(
            { it.partnerRepeats },
            { it.balanceViolations },
            { it.opponentRepeats },
            { it.totalBalance },
            { it.courtRepeats },
            { it.withinPenalty },
            { it.tieBreak }
        )
    }
}

/**
 * Планировщик для «Американки» с глобальной оптимизацией раунда:
 * - перебирает все разбиения N игроков на N/4 четвёрок (с pruning по lexicographic cost),
 * - для каждой четвёрки выбирает наилучший split на команды и корт,
 * - lexicographic приоритеты: сначала ротация (партнёры → соперники), потом баланс.
 *
 * Для 2-3 кортов перебор быстрый (≪200K вариантов). На 4+ кортов полный перебор неподъёмен,
 * поэтому там сначала пробуем жадный план, а если он повторяет партнёрства — ищем раунд
 * с жёстким запретом повторов (см. planRoundWithoutPartnerRepeats).
 */
class PairingPlanner(
    private val ratingByPlayer: Map<UUID, Int>,
    private val courtsCount: Int,
    private val pairingMode: com.padelgo.domain.PairingMode = com.padelgo.domain.PairingMode.ROUND_ROBIN,
    private val maxTeamDiff: Int? = null,
    private val random: Random = Random.Default
) {
    private val partnerCounts = mutableMapOf<PairKey, Int>()
    private val opponentCounts = mutableMapOf<PairKey, Int>()
    private val playedRounds = mutableMapOf<UUID, Int>()
    private val courtCounts = mutableMapOf<UUID, MutableMap<Int, Int>>()

    fun planRounds(allPlayers: List<UUID>, rounds: Int): List<List<PlannedMatch>> {
        require(courtsCount > 0) { "courtsCount must be > 0" }
        val capacity = courtsCount * 4
        require(allPlayers.size >= capacity) { "Need at least $capacity players for $courtsCount courts" }

        // Идеальная конфигурация (все играют каждый раунд, истории нет) — строим расписание
        // партнёрств сразу на весь турнир круговым методом. Пораундовый перебор так не умеет:
        // он оптимизирует текущий раунд и к концу загоняет себя в угол, когда раунда без
        // повторов уже не существует. Здесь же «каждый с каждым ровно один раз» гарантировано
        // построением. См. perfectPartnerSchedule.
        val partnerSchedule = perfectPartnerSchedule(allPlayers, rounds)

        val result = mutableListOf<List<PlannedMatch>>()
        repeat(rounds) { roundIndex ->
            val matches = if (partnerSchedule != null) {
                matchesFromPairs(partnerSchedule[roundIndex])
            } else {
                planSingleRound(selectPlayersForRound(allPlayers, capacity))
            }
            applyRoundStats(matches)
            result.add(matches)
        }
        return result
    }

    /**
     * Расписание партнёрств на весь турнир круговым методом (1-факторизация полного графа):
     * фиксируем одного игрока, остальных вращаем по кругу. За n−1 раундов каждая пара
     * встречается РОВНО один раз — это свойство самого построения, искать ничего не нужно.
     *
     * null (работает старый пораундовый путь), если построение неприменимо:
     * - игроков больше вместимости: нужна ротация отдыха, а круговое расписание её не знает;
     * - уже есть история партнёрств: раунды догенерируются к сыгранному, круг начинать поздно;
     * - раундов больше n−1: круг исчерпан, дальше повторы неизбежны;
     * - BALANCED: там пары подбираются по рейтингу (сильный+слабый), а круговой метод
     *   рейтинги игнорирует — это сломало бы смысл режима.
     */
    private fun perfectPartnerSchedule(
        allPlayers: List<UUID>,
        rounds: Int
    ): List<List<Pair<UUID, UUID>>>? {
        val n = allPlayers.size
        if (pairingMode != com.padelgo.domain.PairingMode.ROUND_ROBIN) return null
        if (n != courtsCount * 4) return null
        if (partnerCounts.isNotEmpty()) return null
        if (rounds > n - 1) return null

        val fixed = allPlayers.last()
        val rot = allPlayers.dropLast(1)
        val m = rot.size
        return (0 until rounds).map { r ->
            val pairs = ArrayList<Pair<UUID, UUID>>(n / 2)
            pairs += rot[r % m] to fixed
            for (i in 1 until n / 2) {
                pairs += rot[(r + i) % m] to rot[((r - i) % m + m) % m]
            }
            pairs
        }
    }

    /**
     * Пары раунда уже заданы — осталось разложить их по матчам (пара против пары) и кортам.
     * Партнёрства трогать нельзя, поэтому перебираем только разбиение пар на противостояния
     * и выбираем лучшее по той же lexicographic cost: ротация соперников, баланс, корты.
     * Вариантов немного (для 8 пар — 105), перебор мгновенный.
     */
    private fun matchesFromPairs(pairs: List<Pair<UUID, UUID>>): List<PlannedMatch> {
        val k = pairs.size
        val used = BooleanArray(k)
        val acc = mutableListOf<PlannedMatch>()
        var best: List<PlannedMatch>? = null
        var bestCost: RoundCost? = null

        fun rec(running: RoundCost) {
            if (acc.size == k / 2) {
                val withCourts = assignCourts(acc.toList())
                val cost = totalRoundCost(withCourts)
                val bound = bestCost
                if (bound == null || costComparator.compare(cost, bound) < 0) {
                    bestCost = cost
                    best = withCourts
                }
                return
            }
            val bound = bestCost
            if (bound != null && costComparator.compare(running, bound) > 0) return

            val first = (0 until k).firstOrNull { !used[it] } ?: return
            for (j in (first + 1) until k) {
                if (used[j]) continue
                val match = PlannedMatch(1, teamA = pairs[first], teamB = pairs[j])
                used[first] = true; used[j] = true
                acc.add(match)
                rec(running + matchCostBeforeCourt(match))
                acc.removeAt(acc.size - 1)
                used[first] = false; used[j] = false
            }
        }

        rec(RoundCost.ZERO)
        return best ?: assignCourts(
            (pairs.indices step 2).map { PlannedMatch(1, teamA = pairs[it], teamB = pairs[it + 1]) }
        )
    }

    fun seedFromMatches(matches: List<Match>) {
        matches.forEach { m ->
            val a1 = m.teamAPlayer1Id
            val a2 = m.teamAPlayer2Id
            val b1 = m.teamBPlayer1Id
            val b2 = m.teamBPlayer2Id
            if (a1 == null || a2 == null || b1 == null || b2 == null) return@forEach
            applyRoundStats(
                listOf(
                    PlannedMatch(
                        courtNumber = m.courtNumber,
                        teamA = a1 to a2,
                        teamB = b1 to b2
                    )
                )
            )
        }
    }

    private fun selectPlayersForRound(allPlayers: List<UUID>, capacity: Int): List<UUID> {
        if (allPlayers.size == capacity) return allPlayers
        // Если игроков больше вместимости — приоритет тем кто играл меньше раундов.
        return allPlayers
            .sortedWith(
                compareBy<UUID> { playedRounds[it] ?: 0 }
                    .thenByDescending { ratingByPlayer[it] ?: 1000 }
            )
            .take(capacity)
    }

    private val costComparator: Comparator<RoundCost> = when (pairingMode) {
        com.padelgo.domain.PairingMode.ROUND_ROBIN -> RoundCost.ROTATION_FIRST
        com.padelgo.domain.PairingMode.BALANCED -> RoundCost.BALANCE_FIRST
    }

    private fun planSingleRound(players: List<UUID>): List<PlannedMatch> {
        require(players.size % 4 == 0) { "Players for round must be multiple of 4" }
        val expectedCourts = players.size / 4

        // Сортируем по рейтингу убывающе — это влияет только на порядок перебора (для скорости и pruning).
        val sorted = players.sortedByDescending { ratingByPlayer[it] ?: 1000 }
        val n = sorted.size

        // Жадный fallback используется как стартовый best_cost для агрессивного pruning,
        // и единственный результат если courtsCount ≥ 4 (перебор слишком большой).
        val greedyMatches = greedyRound(sorted)
        val greedyCost = totalRoundCost(greedyMatches)

        if (expectedCourts >= 4) {
            // Полный перебор здесь неподъёмен (16 игроков — ~2.6 млн разбиений), но требование
            // «никто не играет в паре с кем-то дважды» жёсткое, а жадность его регулярно нарушала:
            // на 4 кортах и 16 игроках получалось 4-6 повторных партнёрств за эвент и столько же
            // пар, которые не сыграли вместе ни разу. Поэтому если жадный план уже без повторов —
            // берём его (быстрый путь), иначе ищем раунд с жёстким запретом повторов.
            if (greedyCost.partnerRepeats == 0) return greedyMatches
            return planRoundWithoutPartnerRepeats(sorted, expectedCourts) ?: greedyMatches
        }

        // Полный перебор разбиений на четвёрки. Фиксируем первого свободного игрока в текущей четвёрке,
        // чтобы не считать дубликаты разбиений (одно и то же разбиение в другом порядке четвёрок).
        var bestMatches: List<PlannedMatch> = greedyMatches
        var bestCost: RoundCost = greedyCost

        val taken = BooleanArray(n)
        val acc = mutableListOf<PlannedMatch>()

        fun search(running: RoundCost) {
            if (acc.size == expectedCourts) {
                // Назначаем корты для собранного разбиения и оцениваем целиком.
                val withCourts = assignCourts(acc.toList())
                val finalCost = totalRoundCost(withCourts)
                if (costComparator.compare(finalCost, bestCost) < 0) {
                    bestCost = finalCost
                    bestMatches = withCourts
                }
                return
            }
            // Pruning по уже накопленной стоимости — если уже хуже best, не идём глубже.
            if (costComparator.compare(running, bestCost) > 0) return

            val firstFree = (0 until n).firstOrNull { !taken[it] } ?: return
            for (i in (firstFree + 1) until n) {
                if (taken[i]) continue
                for (j in (i + 1) until n) {
                    if (taken[j]) continue
                    for (k in (j + 1) until n) {
                        if (taken[k]) continue
                        val quad = listOf(sorted[firstFree], sorted[i], sorted[j], sorted[k])
                        // 3 варианта split команд для этой четвёрки. Корт временно = 1 — назначим позже.
                        val splits = listOf(
                            PlannedMatch(1, teamA = quad[0] to quad[1], teamB = quad[2] to quad[3]),
                            PlannedMatch(1, teamA = quad[0] to quad[2], teamB = quad[1] to quad[3]),
                            PlannedMatch(1, teamA = quad[0] to quad[3], teamB = quad[1] to quad[2])
                        )
                        for (split in splits) {
                            val splitCost = matchCostBeforeCourt(split)
                            val newRunning = running + splitCost
                            if (costComparator.compare(newRunning, bestCost) > 0) continue

                            taken[firstFree] = true; taken[i] = true; taken[j] = true; taken[k] = true
                            acc.add(split)
                            search(newRunning)
                            acc.removeAt(acc.size - 1)
                            taken[firstFree] = false; taken[i] = false; taken[j] = false; taken[k] = false
                        }
                    }
                }
            }
        }

        search(RoundCost.ZERO)
        return bestMatches
    }

    /**
     * Раунд БЕЗ повторов партнёрств: DFS по разбиениям, где обе пары каждого матча ещё ни разу
     * не играли вместе. Жёсткое ограничение отсекает подавляющую часть дерева, поэтому при 4+
     * кортах это на порядки дешевле полного перебора. Среди допустимых вариантов выбираем
     * лучший по той же lexicographic cost, что и везде, и выходим сразу, как только нашли
     * идеальный по ротации раунд (не повторили ни партнёров, ни соперников).
     *
     * null — такого раунда не нашлось: либо партнёрская сетка исчерпана (все возможные пары
     * уже сыграны), либо кончился бюджет узлов. Вызывающий код в этом случае берёт жадный план.
     */
    private fun planRoundWithoutPartnerRepeats(
        sorted: List<UUID>,
        expectedCourts: Int
    ): List<PlannedMatch>? {
        val n = sorted.size
        val taken = BooleanArray(n)
        val acc = mutableListOf<PlannedMatch>()
        var best: List<PlannedMatch>? = null
        var bestCost: RoundCost? = null
        var budget = NO_REPEAT_NODE_BUDGET
        var stop = false

        fun neverPartnered(x: UUID, y: UUID): Boolean = (partnerCounts[PairKey.of(x, y)] ?: 0) == 0

        fun search(running: RoundCost) {
            if (stop) return
            if (budget-- <= 0) {
                stop = true
                return
            }
            if (acc.size == expectedCourts) {
                val withCourts = assignCourts(acc.toList())
                val finalCost = totalRoundCost(withCourts)
                val prev = bestCost
                if (prev == null || costComparator.compare(finalCost, prev) < 0) {
                    bestCost = finalCost
                    best = withCourts
                    if (finalCost.partnerRepeats == 0 && finalCost.opponentRepeats == 0) stop = true
                }
                return
            }
            val boundBefore = bestCost
            if (boundBefore != null && costComparator.compare(running, boundBefore) > 0) return

            val firstFree = (0 until n).firstOrNull { !taken[it] } ?: return
            for (i in (firstFree + 1) until n) {
                if (taken[i]) continue
                for (j in (i + 1) until n) {
                    if (taken[j]) continue
                    for (k in (j + 1) until n) {
                        if (taken[k]) continue
                        val q = listOf(sorted[firstFree], sorted[i], sorted[j], sorted[k])
                        val splits = listOf(
                            PlannedMatch(1, teamA = q[0] to q[1], teamB = q[2] to q[3]),
                            PlannedMatch(1, teamA = q[0] to q[2], teamB = q[1] to q[3]),
                            PlannedMatch(1, teamA = q[0] to q[3], teamB = q[1] to q[2])
                        )
                        for (split in splits) {
                            if (!neverPartnered(split.teamA.first, split.teamA.second)) continue
                            if (!neverPartnered(split.teamB.first, split.teamB.second)) continue
                            val newRunning = running + matchCostBeforeCourt(split)
                            val bound = bestCost
                            if (bound != null && costComparator.compare(newRunning, bound) > 0) continue
                            taken[firstFree] = true; taken[i] = true; taken[j] = true; taken[k] = true
                            acc.add(split)
                            search(newRunning)
                            acc.removeAt(acc.size - 1)
                            taken[firstFree] = false; taken[i] = false; taken[j] = false; taken[k] = false
                            if (stop) return
                        }
                    }
                }
            }
        }

        search(RoundCost.ZERO)
        return best
    }

    /** Жадный fallback: тот же anchor-first что и раньше, но через ту же lexicographic cost. */
    private fun greedyRound(sortedPlayers: List<UUID>): List<PlannedMatch> {
        val remaining = sortedPlayers.toMutableList()
        val matches = mutableListOf<PlannedMatch>()
        while (remaining.size >= 4 && matches.size < courtsCount) {
            val anchor = remaining.first()
            val others = remaining.drop(1)
            var best: PlannedMatch? = null
            var bestCost: RoundCost? = null
            for (i in 0 until others.size - 2) {
                for (j in i + 1 until others.size - 1) {
                    for (k in j + 1 until others.size) {
                        val quad = listOf(anchor, others[i], others[j], others[k])
                        val splits = listOf(
                            PlannedMatch(1, quad[0] to quad[1], quad[2] to quad[3]),
                            PlannedMatch(1, quad[0] to quad[2], quad[1] to quad[3]),
                            PlannedMatch(1, quad[0] to quad[3], quad[1] to quad[2])
                        )
                        for (split in splits) {
                            val c = matchCostBeforeCourt(split)
                            if (bestCost == null || costComparator.compare(c, bestCost!!) < 0) {
                                bestCost = c
                                best = split
                            }
                        }
                    }
                }
            }
            val chosen = best ?: break
            matches.add(chosen)
            remaining.remove(chosen.teamA.first)
            remaining.remove(chosen.teamA.second)
            remaining.remove(chosen.teamB.first)
            remaining.remove(chosen.teamB.second)
        }
        return assignCourts(matches)
    }

    /** Cost одного матча БЕЗ учёта корта — используется в перебор и greedy. */
    private fun matchCostBeforeCourt(m: PlannedMatch): RoundCost {
        val ra1 = ratingByPlayer[m.teamA.first] ?: 1000
        val ra2 = ratingByPlayer[m.teamA.second] ?: 1000
        val rb1 = ratingByPlayer[m.teamB.first] ?: 1000
        val rb2 = ratingByPlayer[m.teamB.second] ?: 1000

        // Используем ту же формулу командного рейтинга что и Elo (weighted 60/40 в пользу слабого).
        // Так "balance" совпадает с реальной expected probability — команда 1800+1400 (teamRating 1560)
        // и 1600+1600 (teamRating 1600) разные по силе, а старая формула суммы их уравнивала.
        val teamA = EloRating.teamRating(ra1, ra2)
        val teamB = EloRating.teamRating(rb1, rb2)
        val balance = abs(teamA - teamB)
        val balanceViolation =
            if (pairingMode == com.padelgo.domain.PairingMode.BALANCED && maxTeamDiff != null && balance > maxTeamDiff) 1 else 0

        val partnerRepeats =
            (partnerCounts[PairKey.of(m.teamA.first, m.teamA.second)] ?: 0) +
                (partnerCounts[PairKey.of(m.teamB.first, m.teamB.second)] ?: 0)

        val opponentRepeats = listOf(
            PairKey.of(m.teamA.first, m.teamB.first),
            PairKey.of(m.teamA.first, m.teamB.second),
            PairKey.of(m.teamA.second, m.teamB.first),
            PairKey.of(m.teamA.second, m.teamB.second)
        ).sumOf { opponentCounts[it] ?: 0 }

        // Слегка поощряем команды с сильным+слабым: больше внутрикомандная разница → меньше penalty.
        val withinDiff = abs(ra1 - ra2) + abs(rb1 - rb2)
        val withinPenalty = -withinDiff // больше разница (хорошо) → меньше penalty

        return RoundCost(
            partnerRepeats = partnerRepeats,
            opponentRepeats = opponentRepeats,
            balanceViolations = balanceViolation,
            totalBalance = balance,
            courtRepeats = 0,
            withinPenalty = withinPenalty,
            tieBreak = random.nextInt(0, 1000)
        )
    }

    /** Полный cost раунда с учётом корта (вызывается на листе перебора). */
    private fun totalRoundCost(matches: List<PlannedMatch>): RoundCost {
        var sum = RoundCost.ZERO
        for (m in matches) {
            val c = matchCostBeforeCourt(m).copy(
                courtRepeats = listOf(m.teamA.first, m.teamA.second, m.teamB.first, m.teamB.second)
                    .sumOf { p -> courtCounts[p]?.get(m.courtNumber) ?: 0 }
            )
            sum = sum + c
        }
        return sum
    }

    /** Назначение корта: для каждого матча выбираем корт, на котором его игроки реже играли. */
    private fun assignCourts(matches: List<PlannedMatch>): List<PlannedMatch> {
        if (matches.isEmpty()) return matches
        val available = (1..courtsCount).toMutableList()
        // Сначала размещаем матчи где у игроков сильное «прилипание» к какому-то корту — у них меньше вариантов
        val ordered = matches.sortedByDescending { m ->
            val players = listOf(m.teamA.first, m.teamA.second, m.teamB.first, m.teamB.second)
            players.sumOf { p -> courtCounts[p]?.values?.maxOrNull() ?: 0 }
        }
        val result = mutableListOf<PlannedMatch>()
        ordered.forEach { m ->
            val bestCourt = available.minBy { court ->
                val players = listOf(m.teamA.first, m.teamA.second, m.teamB.first, m.teamB.second)
                players.sumOf { p -> courtCounts[p]?.get(court) ?: 0 }
            }
            result.add(m.copy(courtNumber = bestCourt))
            available.remove(bestCourt)
        }
        return result.sortedBy { it.courtNumber }
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
