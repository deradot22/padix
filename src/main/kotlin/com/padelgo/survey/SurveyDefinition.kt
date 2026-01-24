package com.padelgo.survey

/**
 * Survey definition lives on backend so it can be reused by any client (web/mobile).
 *
 * The client should render this definition and submit selected option ids.
 */
object SurveyDefinitionV1 {
    const val version: Int = 1
    const val id: String = "survey-v1"

    data class LevelCard(
        val id: String,
        val title: String,
        val level: Double,
        val bullets: List<String>
    )

    data class Option(
        val id: String,
        val label: String,
        val delta: Double
    )

    data class Question(
        val id: String,
        val title: String,
        val options: List<Option>
    )

    val levelCards: List<LevelCard> = listOf(
        LevelCard(
            id = "lvl_newbie",
            title = "0–1.5 Новичок",
            level = 1.0,
            bullets = listOf(
                "только учишь правила/счёт",
                "мяч часто “не долетает” или улетает",
                "редко используешь стены осознанно"
            )
        ),
        LevelCard(
            id = "lvl_beginner",
            title = "2.0–2.5 Начальный",
            level = 2.25,
            bullets = listOf(
                "умеешь держать обмен 4–6 ударов",
                "подача попадает, возврат есть, но без контроля",
                "у сетки стоишь, но часто ловишь лоб/прострел"
            )
        ),
        LevelCard(
            id = "lvl_midminus",
            title = "3.0 Средний-",
            level = 3.0,
            bullets = listOf(
                "стабильно держишь 10+ ударов в розыгрыше",
                "понимаешь позиции: кто у сетки — тот атакует",
                "начинаешь играть через стену (хотя бы иногда)"
            )
        ),
        LevelCard(
            id = "lvl_mid",
            title = "3.5 Средний",
            level = 3.5,
            bullets = listOf(
                "регулярно выходишь к сетке после лоба",
                "есть стабильные: воллей, бандеха/вибора (не в аут)",
                "ошибок меньше, чем “чудо-ударов”"
            )
        ),
        LevelCard(
            id = "lvl_confident",
            title = "4.0 Уверенный",
            level = 4.0,
            bullets = listOf(
                "умеешь защищаться со стен и возвращать в игру",
                "играешь тактически: в ноги/по центру/под слабого",
                "редко отдаёшь сетку просто так"
            )
        ),
        LevelCard(
            id = "lvl_strong",
            title = "4.5 Сильный",
            level = 4.5,
            bullets = listOf(
                "управляешь темпом: медленно/быстро, низко/высоко",
                "контратакуешь: чикита, блок-воллей, вибора по стеклу",
                "стабилен под давлением, мало “псих-ошибок”"
            )
        ),
        LevelCard(
            id = "lvl_tournament",
            title = "5.0+ Турнирный",
            level = 5.5,
            bullets = listOf(
                "почти нет простых ошибок",
                "стенки, скорость решений, вариативность — на уровне",
                "выигрываешь очки планом, а не случайно"
            )
        )
    )

    val questions: List<Question> = listOf(
        Question(
            id = "q_wall",
            title = "Игра со стенами",
            options = listOf(
                Option("q_wall_0", "Почти не использую", -0.5),
                Option("q_wall_1", "Иногда, но нестабильно", 0.0),
                Option("q_wall_2", "Стабильно в защите", 0.4),
                Option("q_wall_3", "И в защите, и в атаке (по стеклу/углам)", 0.7)
            )
        ),
        Question(
            id = "q_net",
            title = "Игра у сетки",
            options = listOf(
                Option("q_net_0", "У сетки теряюсь", -0.4),
                Option("q_net_1", "Стою, но часто ловлю лоб/прострел", 0.0),
                Option("q_net_2", "Стабильный воллей/смэш по ситуации", 0.4),
                Option("q_net_3", "Управляю сеткой и темпом розыгрыша", 0.6)
            )
        ),
        Question(
            id = "q_lob",
            title = "Лоб как инструмент",
            options = listOf(
                Option("q_lob_0", "Редко/случайно", -0.3),
                Option("q_lob_1", "Иногда спасаюсь лобом", 0.0),
                Option("q_lob_2", "Лоб точный, часто помогает выйти к сетке", 0.4),
                Option("q_lob_3", "Лоб тактический: под руку/в зону, контролирую глубину", 0.6)
            )
        ),
        Question(
            id = "q_consistency",
            title = "Стабильность",
            options = listOf(
                Option("q_consistency_0", "Много простых ошибок", -0.6),
                Option("q_consistency_1", "Ошибаюсь, когда ускоряюсь", 0.0),
                Option("q_consistency_2", "Стабилен под давлением", 0.4),
                Option("q_consistency_3", "Очень стабилен, почти без “подарков”", 0.7)
            )
        ),
        Question(
            id = "q_tactics",
            title = "Тактика",
            options = listOf(
                Option("q_tactics_0", "Играю “куда попало”", -0.3),
                Option("q_tactics_1", "Иногда вижу слабого игрока", 0.0),
                Option("q_tactics_2", "Регулярно играю в ноги/центр/под слабого", 0.4),
                Option("q_tactics_3", "План на очко + чтение соперника", 0.6)
            )
        )
    )

    fun baseLevelByCardId(cardId: String): Double =
        levelCards.firstOrNull { it.id == cardId }?.level
            ?: error("Unknown levelCardId=$cardId")

    fun deltaByOptionId(optionId: String): Double {
        val all = questions.flatMap { it.options }
        return all.firstOrNull { it.id == optionId }?.delta ?: error("Unknown optionId=$optionId")
    }
}

/**
 * V2: only questions, no "self-assessment" level cards.
 */
object SurveyDefinitionV2 {
    const val version: Int = 2
    const val id: String = "survey-v2"

    data class Option(
        val id: String,
        val label: String,
        val delta: Double
    )

    data class Question(
        val id: String,
        val title: String,
        val options: List<Option>
    )

    // Same questions as v1, but without level cards.
    val questions: List<Question> = listOf(
        Question(
            id = "q_wall",
            title = "Игра со стенами",
            options = listOf(
                Option("q_wall_0", "Почти не использую", -0.5),
                Option("q_wall_1", "Иногда, но нестабильно", 0.0),
                Option("q_wall_2", "Стабильно в защите", 0.4),
                Option("q_wall_3", "И в защите, и в атаке (по стеклу/углам)", 0.7)
            )
        ),
        Question(
            id = "q_net",
            title = "Игра у сетки",
            options = listOf(
                Option("q_net_0", "У сетки теряюсь", -0.4),
                Option("q_net_1", "Стою, но часто ловлю лоб/прострел", 0.0),
                Option("q_net_2", "Стабильный воллей/смэш по ситуации", 0.4),
                Option("q_net_3", "Управляю сеткой и темпом розыгрыша", 0.6)
            )
        ),
        Question(
            id = "q_lob",
            title = "Лоб как инструмент",
            options = listOf(
                Option("q_lob_0", "Редко/случайно", -0.3),
                Option("q_lob_1", "Иногда спасаюсь лобом", 0.0),
                Option("q_lob_2", "Лоб точный, часто помогает выйти к сетке", 0.4),
                Option("q_lob_3", "Лоб тактический: под руку/в зону, контролирую глубину", 0.6)
            )
        ),
        Question(
            id = "q_consistency",
            title = "Стабильность",
            options = listOf(
                Option("q_consistency_0", "Много простых ошибок", -0.6),
                Option("q_consistency_1", "Ошибаюсь, когда ускоряюсь", 0.0),
                Option("q_consistency_2", "Стабилен под давлением", 0.4),
                Option("q_consistency_3", "Очень стабилен, почти без “подарков”", 0.7)
            )
        ),
        Question(
            id = "q_tactics",
            title = "Тактика",
            options = listOf(
                Option("q_tactics_0", "Играю “куда попало”", -0.3),
                Option("q_tactics_1", "Иногда вижу слабого игрока", 0.0),
                Option("q_tactics_2", "Регулярно играю в ноги/центр/под слабого", 0.4),
                Option("q_tactics_3", "План на очко + чтение соперника", 0.6)
            )
        )
    )

    fun deltaByOptionId(optionId: String): Double {
        val all = questions.flatMap { it.options }
        return all.firstOrNull { it.id == optionId }?.delta ?: error("Unknown optionId=$optionId")
    }
}

