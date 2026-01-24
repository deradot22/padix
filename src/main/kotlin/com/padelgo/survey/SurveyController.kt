package com.padelgo.survey

import com.padelgo.api.ApiException
import com.padelgo.auth.JwtPrincipal
import com.padelgo.auth.AuthService
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/survey")
class SurveyController(
    private val survey: SurveyService,
    private val auth: AuthService
) {
    @GetMapping("/current")
    fun current(): SurveyDefinitionResponse = survey.currentDefinition()

    @PostMapping("/submit")
    fun submit(@Valid @RequestBody req: SurveySubmitRequest): com.padelgo.auth.MeResponse {
        val p = principal()
        survey.submit(p, req)
        return auth.me(p)
    }

    private fun principal(): JwtPrincipal {
        val p = SecurityContextHolder.getContext().authentication?.principal
        if (p is JwtPrincipal) return p
        throw ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized")
    }
}

