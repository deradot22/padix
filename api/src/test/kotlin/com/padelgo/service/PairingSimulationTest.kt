package com.padelgo.service

import com.padelgo.domain.PairingMode
import org.junit.jupiter.api.Test
import java.util.UUID
import kotlin.math.abs
import kotlin.random.Random

/**
 * Симуляция работы PairingPlanner на реальных конфигурациях.
 * Считает метрики: повторы партнёров, повторы соперников, дисбаланс команд,
 * прилипание к корту. Печатает таблицу для визуальной оценки.
 *
 * Запуск: ./gradlew test --tests PairingSimulationTest
 */
class PairingSimulationTest {

    private data class Stats(
        val partnerHistogram: Map<Int, Int>, // сколько пар сыграло вместе N раз
        val maxPartnerCount: Int,             // максимум — кто-то с кем-то N раз
        val totalPartnerRepeats: Int,         // суммарных повторов (count > 1)
        val opponentHistogram: Map<Int, Int>,
        val maxOpponentCount: Int,
        val totalBalance: Int,                // сумма |teamA - teamB| по всем матчам
        val avgBalance: Double,
        val maxBalance: Int,
        val courtConcentration: Double,       // средняя «прилипчивость» к одному корту (0..1)
        val matchesPerPlayer: Map<UUID, Int>
    )

    private fun simulate(
        playerCount: Int,
        courts: Int,
        rounds: Int,
        ratings: List<Int>,
        mode: PairingMode,
        maxTeamDiff: Int? = null,
        seed: Long = 42L
    ): Pair<List<List<PlannedMatch>>, Stats> {
        require(ratings.size == playerCount) { "ratings size != playerCount" }
        val players = (1..playerCount).map { UUID.randomUUID() }
        val ratingMap = players.zip(ratings).toMap()

        val planner = PairingPlanner(
            ratingByPlayer = ratingMap,
            courtsCount = courts,
            pairingMode = mode,
            maxTeamDiff = maxTeamDiff,
            random = Random(seed)
        )
        val allRounds = planner.planRounds(players, rounds)

        // Собираем метрики
        val partnerCounts = mutableMapOf<Set<UUID>, Int>()
        val opponentCounts = mutableMapOf<Set<UUID>, Int>()
        val courtCounts = mutableMapOf<UUID, MutableMap<Int, Int>>()
        val matchesPerPlayer = mutableMapOf<UUID, Int>()
        var totalBalance = 0
        var maxBalance = 0
        var matchCount = 0

        allRounds.forEach { roundMatches ->
            roundMatches.forEach { m ->
                val teamA = setOf(m.teamA.first, m.teamA.second)
                val teamB = setOf(m.teamB.first, m.teamB.second)
                partnerCounts[teamA] = (partnerCounts[teamA] ?: 0) + 1
                partnerCounts[teamB] = (partnerCounts[teamB] ?: 0) + 1
                for (a in teamA) for (b in teamB) {
                    val key = setOf(a, b)
                    opponentCounts[key] = (opponentCounts[key] ?: 0) + 1
                }
                val sumA = ratingMap[m.teamA.first]!! + ratingMap[m.teamA.second]!!
                val sumB = ratingMap[m.teamB.first]!! + ratingMap[m.teamB.second]!!
                val balance = abs(sumA - sumB)
                totalBalance += balance
                maxBalance = maxOf(maxBalance, balance)
                matchCount += 1
                listOf(m.teamA.first, m.teamA.second, m.teamB.first, m.teamB.second).forEach { p ->
                    val map = courtCounts.getOrPut(p) { mutableMapOf() }
                    map[m.courtNumber] = (map[m.courtNumber] ?: 0) + 1
                    matchesPerPlayer[p] = (matchesPerPlayer[p] ?: 0) + 1
                }
            }
        }

        val partnerHist = partnerCounts.values.groupingBy { it }.eachCount().toSortedMap()
        val opponentHist = opponentCounts.values.groupingBy { it }.eachCount().toSortedMap()

        // courtConcentration: для каждого игрока — макс_корт / всего_матчей. Среднее по игрокам.
        val concentrations = matchesPerPlayer.map { (p, total) ->
            val maxOnOne = courtCounts[p]?.values?.maxOrNull() ?: 0
            if (total == 0) 0.0 else maxOnOne.toDouble() / total.toDouble()
        }
        val avgConcentration = if (concentrations.isEmpty()) 0.0 else concentrations.average()

        val stats = Stats(
            partnerHistogram = partnerHist,
            maxPartnerCount = partnerCounts.values.maxOrNull() ?: 0,
            totalPartnerRepeats = partnerCounts.values.filter { it > 1 }.sumOf { it - 1 },
            opponentHistogram = opponentHist,
            maxOpponentCount = opponentCounts.values.maxOrNull() ?: 0,
            totalBalance = totalBalance,
            avgBalance = if (matchCount == 0) 0.0 else totalBalance.toDouble() / matchCount,
            maxBalance = maxBalance,
            courtConcentration = avgConcentration,
            matchesPerPlayer = matchesPerPlayer
        )
        return allRounds to stats
    }

    private fun printStats(label: String, stats: Stats) {
        println("\n=== $label ===")
        println("Гистограмма партнёрств (count раз → сколько пар):")
        stats.partnerHistogram.forEach { (k, v) -> println("  $k раз вместе: $v пар(а)") }
        println("Максимум повторов партнёрства: ${stats.maxPartnerCount}")
        println("Суммарных повторов партнёрства (count > 1): ${stats.totalPartnerRepeats}")
        println("\nГистограмма соперничеств (count раз → сколько пар):")
        stats.opponentHistogram.forEach { (k, v) -> println("  $k раз против: $v пар(а)") }
        println("Максимум повторов соперничества: ${stats.maxOpponentCount}")
        println("\nДисбаланс команд:")
        println("  Средний: ${"%.1f".format(stats.avgBalance)}")
        println("  Макс:    ${stats.maxBalance}")
        println("  Сумма:   ${stats.totalBalance}")
        println("\nПрилипание к корту (1.0 = всегда на одном): ${"%.2f".format(stats.courtConcentration)}")
        val perPlayer = stats.matchesPerPlayer.values
        println("Матчей на игрока: min=${perPlayer.minOrNull()}, max=${perPlayer.maxOrNull()}")
    }

    @Test
    fun `симуляция 12 игроков, 3 корта, 6 раундов, ROUND_ROBIN`() {
        val ratings = listOf(1200, 1250, 1300, 1350, 1400, 1450, 1500, 1550, 1600, 1650, 1700, 1750)
        val (_, stats) = simulate(12, 3, 6, ratings, PairingMode.ROUND_ROBIN)
        printStats("12×3×6 ROUND_ROBIN (рейтинги 1200..1750)", stats)
        // Ожидаемое: ≤6 повторов партнёрства (за 6 раундов теоретический max — 6×3=18 пар, всего C(12,2)=66 → должно быть 0-1 повторов)
        check(stats.maxPartnerCount <= 2) {
            "Слишком много повторов партнёрства: max=${stats.maxPartnerCount}"
        }
    }

    @Test
    fun `симуляция 12 игроков, 3 корта, 6 раундов, BALANCED`() {
        val ratings = listOf(1200, 1250, 1300, 1350, 1400, 1450, 1500, 1550, 1600, 1650, 1700, 1750)
        val maxDiff = maxOf(150, (ratings.max() - ratings.min()) / 2)
        val (_, stats) = simulate(12, 3, 6, ratings, PairingMode.BALANCED, maxDiff)
        printStats("12×3×6 BALANCED maxDiff=$maxDiff (рейтинги 1200..1750)", stats)
        // В BALANCED ротация в приоритете: если повторов нет, alg допускает локальный дисбаланс.
        // Главное — нет повторов партнёрств.
        check(stats.maxPartnerCount <= 2) {
            "Слишком много повторов партнёрства в BALANCED: max=${stats.maxPartnerCount}"
        }
        // Средний баланс всё ещё должен быть умеренным
        check(stats.avgBalance <= maxDiff * 1.5) {
            "Средний дисбаланс высок: ${stats.avgBalance} (cap=$maxDiff)"
        }
    }

    @Test
    fun `симуляция 8 игроков, 2 корта, 7 раундов, ROUND_ROBIN`() {
        val ratings = listOf(1300, 1400, 1500, 1500, 1550, 1600, 1700, 1800)
        val (_, stats) = simulate(8, 2, 7, ratings, PairingMode.ROUND_ROBIN)
        printStats("8×2×7 ROUND_ROBIN (рейтинги 1300..1800)", stats)
    }

    @Test
    fun `симуляция 8 игроков, 2 корта, 7 раундов, BALANCED`() {
        val ratings = listOf(1300, 1400, 1500, 1500, 1550, 1600, 1700, 1800)
        val maxDiff = maxOf(150, (ratings.max() - ratings.min()) / 2)
        val (_, stats) = simulate(8, 2, 7, ratings, PairingMode.BALANCED, maxDiff)
        printStats("8×2×7 BALANCED maxDiff=$maxDiff (рейтинги 1300..1800)", stats)
    }

    @Test
    fun `сценарий пользователя - 9 топов и 3 слабых, 12 игроков 3 корта`() {
        // 3 игрока с рейтингом ~900 + 9 игроков с рейтингом 2000+
        val ratings = listOf(800, 900, 950, 2000, 2050, 2100, 2150, 2200, 2250, 2300, 2350, 2400)
        val playerNames = ratings.mapIndexed { i, r ->
            when {
                r < 1000 -> "Новичок-${r}"
                else -> "Топ-${r}"
            }
        }
        val players = (1..12).map { UUID.randomUUID() }
        val ratingMap = players.zip(ratings).toMap()
        val nameMap = players.zip(playerNames).toMap()

        for (mode in listOf(PairingMode.ROUND_ROBIN, PairingMode.BALANCED)) {
            val maxDiff = if (mode == PairingMode.BALANCED)
                maxOf(150, (ratings.max() - ratings.min()) / 2) else null
            val planner = PairingPlanner(
                ratingByPlayer = ratingMap,
                courtsCount = 3,
                pairingMode = mode,
                maxTeamDiff = maxDiff,
                random = Random(42)
            )
            val rounds = planner.planRounds(players, 6)

            println("\n${"=".repeat(80)}")
            println("РЕЖИМ: $mode${if (maxDiff != null) " (cap=$maxDiff)" else ""}")
            println("=".repeat(80))

            // Считаем повторы партнёрств для итога
            val partnerCounts = mutableMapOf<Set<UUID>, Int>()

            rounds.forEachIndexed { roundIdx, roundMatches ->
                println("\n┌─ Раунд ${roundIdx + 1}")
                roundMatches.sortedBy { it.courtNumber }.forEach { m ->
                    val a1 = nameMap[m.teamA.first]!!
                    val a2 = nameMap[m.teamA.second]!!
                    val b1 = nameMap[m.teamB.first]!!
                    val b2 = nameMap[m.teamB.second]!!
                    val sumA = ratingMap[m.teamA.first]!! + ratingMap[m.teamA.second]!!
                    val sumB = ratingMap[m.teamB.first]!! + ratingMap[m.teamB.second]!!
                    val balance = abs(sumA - sumB)
                    val pairA = setOf(m.teamA.first, m.teamA.second)
                    val pairB = setOf(m.teamB.first, m.teamB.second)
                    partnerCounts[pairA] = (partnerCounts[pairA] ?: 0) + 1
                    partnerCounts[pairB] = (partnerCounts[pairB] ?: 0) + 1
                    val repA = if ((partnerCounts[pairA] ?: 0) > 1) " (повтор!)" else ""
                    val repB = if ((partnerCounts[pairB] ?: 0) > 1) " (повтор!)" else ""
                    println("│ Корт ${m.courtNumber}:")
                    println("│   ${a1.padEnd(14)} + ${a2.padEnd(14)} ($sumA)${repA}")
                    println("│       ПРОТИВ      |Δ=$balance|")
                    println("│   ${b1.padEnd(14)} + ${b2.padEnd(14)} ($sumB)${repB}")
                }
            }

            val totalRepeats = partnerCounts.values.filter { it > 1 }.sumOf { it - 1 }
            val maxCount = partnerCounts.values.max()
            println("\n└─ ИТОГ ($mode):")
            println("   Уникальных пар:        ${partnerCounts.size}")
            println("   Повторов партнёрств:   $totalRepeats")
            println("   Максимум встречаемости: $maxCount раз вместе")
        }
    }

    @Test
    fun `мульти-прогон на реальных рейтингах пользователя`() {
        val labels = listOf("Sergio", "Ruslan", "Мишаня", "Milana", "Алина", "skfl", "Евгений", "Ladick")
        val ratings = listOf(1462, 1296, 1293, 1207, 1121, 988, 965, 961)
        val players = (0 until 8).map { UUID.randomUUID() }
        val ratingMap = players.zip(ratings).toMap()
        val nameMap = players.zip(labels).toMap()
        val maxDiff = 250

        for (seed in listOf(1L, 7L, 42L, 100L, 1337L, 2024L, 9999L)) {
            val planner = PairingPlanner(
                ratingByPlayer = ratingMap,
                courtsCount = 2,
                pairingMode = PairingMode.BALANCED,
                maxTeamDiff = maxDiff,
                random = Random(seed)
            )
            val rounds = planner.planRounds(players, 7)

            println("\n${"=".repeat(80)}")
            println("seed=$seed   BALANCED cap=$maxDiff")
            println("=".repeat(80))

            val partnerCounts = mutableMapOf<Set<UUID>, Int>()
            var totalBalanceSum = 0
            var maxBalanceInRound = 0
            var violations = 0
            rounds.forEachIndexed { roundIdx, roundMatches ->
                println("\nРаунд ${roundIdx + 1}:")
                roundMatches.sortedBy { it.courtNumber }.forEach { m ->
                    val a1 = nameMap[m.teamA.first]!!
                    val a2 = nameMap[m.teamA.second]!!
                    val b1 = nameMap[m.teamB.first]!!
                    val b2 = nameMap[m.teamB.second]!!
                    val sumA = ratingMap[m.teamA.first]!! + ratingMap[m.teamA.second]!!
                    val sumB = ratingMap[m.teamB.first]!! + ratingMap[m.teamB.second]!!
                    val balance = abs(sumA - sumB)
                    totalBalanceSum += balance
                    maxBalanceInRound = maxOf(maxBalanceInRound, balance)
                    if (balance > maxDiff) violations += 1
                    val pairA = setOf(m.teamA.first, m.teamA.second)
                    val pairB = setOf(m.teamB.first, m.teamB.second)
                    partnerCounts[pairA] = (partnerCounts[pairA] ?: 0) + 1
                    partnerCounts[pairB] = (partnerCounts[pairB] ?: 0) + 1
                    val repA = if ((partnerCounts[pairA] ?: 0) > 1) " ⟲${partnerCounts[pairA]}" else ""
                    val repB = if ((partnerCounts[pairB] ?: 0) > 1) " ⟲${partnerCounts[pairB]}" else ""
                    val warn = if (balance > maxDiff) " ⚠️" else ""
                    println("  Корт ${m.courtNumber}: ${a1.padEnd(8)}+${a2.padEnd(8)}$repA  vs  ${b1.padEnd(8)}+${b2.padEnd(8)}$repB  Δ=$balance$warn")
                }
            }
            val totalRepeats = partnerCounts.values.filter { it > 1 }.sumOf { it - 1 }
            val maxRepeats = partnerCounts.values.max()
            println("\nИТОГ seed=$seed: уникальных=${partnerCounts.size}, повторов=$totalRepeats, max=$maxRepeats, " +
                "матчей с Δ>cap=$violations/14, сумма Δ=$totalBalanceSum")
            val locked = partnerCounts.filter { it.value > 1 }.map { (k, v) -> "${k.map { nameMap[it]!! }.sorted().joinToString("+")}×$v" }
            if (locked.isNotEmpty()) println("Повторы: ${locked.joinToString(", ")}")
        }
    }

    @Test
    fun `регрессия - разнородный состав не должен залипать в BALANCED`() {
        // Реальный кейс пользователя: 8 игроков с очень разными рейтингами на 2 кортах.
        // До фикса алгоритм залипал на одной партиции (Ruslan+Алина и Milana+skfl партнёрят
        // все 7 раундов, max повторов = 7). После фикса — 0 повторов за 7 раундов.
        val labels = listOf("Sergio", "Ruslan", "Мишаня", "Milana", "Алина", "skfl", "Евгений", "Ladick")
        val ratings = listOf(1462, 1296, 1293, 1207, 1121, 988, 965, 961)
        val players = (0 until 8).map { UUID.randomUUID() }
        val ratingMap = players.zip(ratings).toMap()
        val nameMap = players.zip(labels).toMap()

        val expectedMaxRepeats = mapOf(
            PairingMode.BALANCED to 2,    // допускаем небольшие повторы, главное — не залипание
            PairingMode.ROUND_ROBIN to 1
        )

        for (mode in listOf(PairingMode.BALANCED, PairingMode.ROUND_ROBIN)) {
            val maxDiff = if (mode == PairingMode.BALANCED) 250 else null
            val planner = PairingPlanner(
                ratingByPlayer = ratingMap,
                courtsCount = 2,
                pairingMode = mode,
                maxTeamDiff = maxDiff,
                random = Random(42)
            )
            val rounds = planner.planRounds(players, 7)

            println("\n${"=".repeat(80)}")
            println("РЕЖИМ: $mode${if (maxDiff != null) " (cap=$maxDiff)" else ""}")
            println("=".repeat(80))

            val partnerCounts = mutableMapOf<Set<UUID>, Int>()
            val courtByPlayer = mutableMapOf<UUID, MutableMap<Int, Int>>()
            rounds.forEachIndexed { roundIdx, roundMatches ->
                println("\nРаунд ${roundIdx + 1}:")
                roundMatches.sortedBy { it.courtNumber }.forEach { m ->
                    val a1 = nameMap[m.teamA.first]!!
                    val a2 = nameMap[m.teamA.second]!!
                    val b1 = nameMap[m.teamB.first]!!
                    val b2 = nameMap[m.teamB.second]!!
                    val sumA = ratingMap[m.teamA.first]!! + ratingMap[m.teamA.second]!!
                    val sumB = ratingMap[m.teamB.first]!! + ratingMap[m.teamB.second]!!
                    val balance = abs(sumA - sumB)
                    val pairA = setOf(m.teamA.first, m.teamA.second)
                    val pairB = setOf(m.teamB.first, m.teamB.second)
                    partnerCounts[pairA] = (partnerCounts[pairA] ?: 0) + 1
                    partnerCounts[pairB] = (partnerCounts[pairB] ?: 0) + 1
                    listOf(m.teamA.first, m.teamA.second, m.teamB.first, m.teamB.second).forEach { p ->
                        val courts = courtByPlayer.getOrPut(p) { mutableMapOf() }
                        courts[m.courtNumber] = (courts[m.courtNumber] ?: 0) + 1
                    }
                    val repA = if ((partnerCounts[pairA] ?: 0) > 1) " ⟲${partnerCounts[pairA]}" else ""
                    val repB = if ((partnerCounts[pairB] ?: 0) > 1) " ⟲${partnerCounts[pairB]}" else ""
                    println("  Корт ${m.courtNumber}: ${a1.padEnd(8)}+${a2.padEnd(8)} ($sumA)$repA  vs  ${b1.padEnd(8)}+${b2.padEnd(8)} ($sumB)$repB  Δ=$balance")
                }
            }
            val totalRepeats = partnerCounts.values.filter { it > 1 }.sumOf { it - 1 }
            val maxRepeats = partnerCounts.values.max()
            println("\nПартнёрства: уникальных=${partnerCounts.size}, повторов=$totalRepeats, max=$maxRepeats")
            val locked = partnerCounts.filter { it.value > 1 }.map { (k, v) -> "${k.map { nameMap[it]!! }.sorted().joinToString("+")}×$v" }
            if (locked.isNotEmpty()) println("Повторившиеся пары: ${locked.joinToString(", ")}")
            println("\nПрилипание игроков к кортам (раундов на каждом корте из 7):")
            courtByPlayer.toSortedMap(compareBy { nameMap[it]!! }).forEach { (p, courts) ->
                println("  ${nameMap[p]!!.padEnd(10)}: ${courts.toSortedMap().entries.joinToString(", ") { "корт${it.key}=${it.value}" }}")
            }

            val limit = expectedMaxRepeats[mode]!!
            check(maxRepeats <= limit) {
                "В режиме $mode max повторов партнёрств = $maxRepeats (порог $limit). " +
                    "Залипшие пары: ${locked.joinToString(", ")}"
            }
        }
    }

    @Test
    fun `симуляция 9 игроков, 2 корта, 6 раундов - кто-то сидит каждый раунд`() {
        // 8 игроков играют, 1 сидит. Должен ротироваться через playedRounds сортировку.
        val ratings = listOf(1300, 1400, 1450, 1500, 1550, 1600, 1650, 1700, 1750)
        val (_, stats) = simulate(9, 2, 6, ratings, PairingMode.ROUND_ROBIN)
        printStats("9×2×6 ROUND_ROBIN - один сидит на замене", stats)
        // Проверка справедливости bye: разница должна быть ≤ 2
        val counts = stats.matchesPerPlayer.values
        val spread = (counts.maxOrNull() ?: 0) - (counts.minOrNull() ?: 0)
        check(spread <= 2) { "Несправедливая ротация замен: spread=$spread матчей" }
    }
}
