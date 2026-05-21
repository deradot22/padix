package com.padelgo.admin

import com.padelgo.api.ApiException
import com.padelgo.api.FeedbackResponse
import com.padelgo.auth.JwtPrincipal
import com.padelgo.service.FeedbackService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.HttpStatus
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@Tag(name = "Admin Feedback", description = "Просмотр и удаление тикетов обратной связи. Требует admin-токен.")
@RestController
@RequestMapping("/api/admin/feedback")
class FeedbackAdminController(
    private val service: FeedbackService
) {
    @Operation(summary = "Список всех тикетов (свежие первыми)")
    @GetMapping
    fun list(): List<FeedbackResponse> {
        requireAdmin()
        return service.listAll()
    }

    @Operation(summary = "Удалить тикет")
    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: UUID) {
        requireAdmin()
        service.delete(id)
    }

    private fun requireAdmin() {
        val p = SecurityContextHolder.getContext().authentication?.principal
        if (p is JwtPrincipal && p.isAdmin) return
        throw ApiException(HttpStatus.FORBIDDEN, "Admin access required")
    }
}
