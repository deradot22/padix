package com.padelgo.survey

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotEmpty
import jakarta.validation.constraints.NotNull

data class SurveyDefinitionResponse(
    val id: String,
    val version: Int,
    val levelCards: List<SurveyDefinitionV1LevelCard>,
    val questions: List<SurveyDefinitionV1Question>
)

data class SurveyDefinitionV1LevelCard(
    val id: String,
    val title: String,
    val level: Double,
    val bullets: List<String>
)

data class SurveyDefinitionV1Question(
    val id: String,
    val title: String,
    val options: List<SurveyDefinitionV1Option>
)

data class SurveyDefinitionV1Option(
    val id: String,
    val label: String
)

data class SurveySubmitRequest(
    @field:NotNull
    val version: Int,

    val baseLevelCardId: String? = null,

    /**
     * questionId -> optionId
     */
    @field:NotEmpty
    val answers: Map<String, String>
)

