package com.padelgo.api

import com.padelgo.auth.JwtPrincipal
import com.padelgo.service.PushTokenService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@Tag(name = "Push", description = "Push-уведомления: регистрация токенов устройств")
@SecurityRequirement(name = "BearerAuth")
@RestController
@RequestMapping("/api/push")
class PushController(
    private val service: PushTokenService,
) {
    @Operation(
        summary = "Зарегистрировать push-токен устройства (FCM)",
        description = "Идемпотентно: повторный вызов с тем же токеном обновляет запись, а не создаёт новую. " +
            "Клиенту следует вызывать метод после логина и при каждой ротации токена в Firebase. " +
            "Если передан deviceId, прошлый токен того же устройства удаляется."
    )
    @PostMapping("/tokens")
    fun registerToken(@Valid @RequestBody req: RegisterPushTokenRequest): PushTokenResponse =
        service.register(principalUserId(), req)

    private fun principalUserId(): UUID {
        val p = SecurityContextHolder.getContext().authentication?.principal
        if (p is JwtPrincipal) return p.userId
        throw ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized")
    }
}
