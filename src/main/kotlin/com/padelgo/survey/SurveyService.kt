package com.padelgo.survey

import com.fasterxml.jackson.databind.ObjectMapper
import com.padelgo.api.ApiException
import com.padelgo.auth.JwtPrincipal
import com.padelgo.auth.UserRepository
import com.padelgo.repo.PlayerRepository
import jakarta.transaction.Transactional
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service

@Service
class SurveyService(
    private val users: UserRepository,
    private val players: PlayerRepository,
    private val objectMapper: ObjectMapper
) {
    fun currentDefinition(): SurveyDefinitionResponse =
        SurveyDefinitionResponse(
            id = SurveyDefinitionV2.id,
            version = SurveyDefinitionV2.version,
            levelCards = emptyList(),
            questions = SurveyDefinitionV2.questions.map { q ->
                SurveyDefinitionV1Question(
                    id = q.id,
                    title = q.title,
                    options = q.options.map { SurveyDefinitionV1Option(it.id, it.label) }
                )
            }
        )

    @Transactional
    fun submit(principal: JwtPrincipal, req: SurveySubmitRequest) {
        if (req.version != SurveyDefinitionV2.version) {
            throw ApiException(HttpStatus.BAD_REQUEST, "Unsupported survey version ${req.version}")
        }

        val user = users.findById(principal.userId).orElseThrow { ApiException(HttpStatus.UNAUTHORIZED, "User not found") }
        val player = players.findById(user.playerId!!).orElseThrow { ApiException(HttpStatus.UNAUTHORIZED, "Player not found") }

        // Validate: must answer each question exactly once
        val expectedQ = SurveyDefinitionV2.questions.map { it.id }.toSet()
        val providedQ = req.answers.keys.toSet()
        if (providedQ != expectedQ) {
            throw ApiException(HttpStatus.BAD_REQUEST, "Answers must include all questions: $expectedQ")
        }

        // No self-assessment in v2: base is neutral mid level.
        val base = 3.0
        var delta = 0.0
        req.answers.forEach { (qid, optionId) ->
            // ensure question exists and option belongs to that question
            val q = SurveyDefinitionV2.questions.firstOrNull { it.id == qid }
                ?: throw ApiException(HttpStatus.BAD_REQUEST, "Unknown questionId=$qid")
            if (q.options.none { it.id == optionId }) {
                throw ApiException(HttpStatus.BAD_REQUEST, "Option $optionId does not belong to question $qid")
            }
            delta += SurveyDefinitionV2.deltaByOptionId(optionId)
        }

        val level = (base + delta).coerceIn(0.0, 7.0)

        // level 0..7 -> rating 800..1600 (более консервативно, чтобы тест не "раздувал" цифры)
        val rating = (800 + (level / 7.0) * 800).toInt().coerceIn(400, 2500)

        user.surveyCompleted = true
        user.surveyLevel = level
        user.surveyVersion = req.version
        user.surveyPayload = objectMapper.writeValueAsString(req)
        user.calibrationEventsRemaining = 3
        player.rating = rating

        users.save(user)
        players.save(player)
    }
}

