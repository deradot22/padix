package com.padelgo.api

import com.padelgo.auth.JwtPrincipal
import com.padelgo.service.FeedbackService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@Tag(name = "Feedback", description = "Тикеты обратной связи. Любой залогиненный юзер может отправить.")
@SecurityRequirement(name = "BearerAuth")
@RestController
@RequestMapping("/api/feedback")
class FeedbackController(
    private val service: FeedbackService
) {
    @Operation(summary = "Отправить тикет (категория + текст + опц. вложение)")
    @PostMapping
    fun submit(@Valid @RequestBody req: SubmitFeedbackRequest): FeedbackResponse =
        service.submit(principalUserId(), req)

    @Operation(summary = "Мои предыдущие обращения (для UI «история отправленных тикетов»)")
    @GetMapping("/mine")
    fun mine(): List<FeedbackResponse> = service.listForUser(principalUserId())

    private fun principalUserId(): java.util.UUID {
        val p = SecurityContextHolder.getContext().authentication?.principal
        if (p is JwtPrincipal) return p.userId
        throw ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized")
    }
}
