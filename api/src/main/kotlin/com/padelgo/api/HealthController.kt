package com.padelgo.api

import io.swagger.v3.oas.annotations.Hidden
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Health-check для Render: пока новая версия не ответит 200, старая продолжает принимать
 * запросы — выкатка проходит без окна, в котором сайт получал «NetworkError».
 */
@Hidden
@RestController
class HealthController {
    @GetMapping("/api/health")
    fun health(): Map<String, String> = mapOf("status" to "ok")
}
