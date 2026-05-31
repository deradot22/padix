package com.padelgo.api

import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.access.AccessDeniedException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

data class ErrorResponse(
    val status: Int,
    val error: String,
    val message: String,
    val path: String?
)

@RestControllerAdvice
class ApiExceptionHandler {
    @ExceptionHandler(ApiException::class)
    fun handleApi(ex: ApiException, req: HttpServletRequest): ResponseEntity<ErrorResponse> =
        ResponseEntity
            .status(ex.status)
            .body(
                ErrorResponse(
                    status = ex.status.value(),
                    error = ex.status.reasonPhrase,
                    message = ex.message,
                    path = req.requestURI
                )
            )

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun handleValidation(ex: MethodArgumentNotValidException, req: HttpServletRequest): ResponseEntity<ErrorResponse> {
        val msg = ex.bindingResult.fieldErrors
            .joinToString("; ") { "${it.field}: ${it.defaultMessage}" }
            .ifBlank { "Validation error" }
        return ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(
                ErrorResponse(
                    status = 400,
                    error = "Bad Request",
                    message = msg,
                    path = req.requestURI
                )
            )
    }

    @ExceptionHandler(IllegalArgumentException::class)
    fun handleIllegalArg(ex: IllegalArgumentException, req: HttpServletRequest): ResponseEntity<ErrorResponse> =
        ResponseEntity
            .status(HttpStatus.BAD_REQUEST)
            .body(
                ErrorResponse(
                    status = 400,
                    error = "Bad Request",
                    message = ex.message ?: "Bad request",
                    path = req.requestURI
                )
            )

    @ExceptionHandler(AccessDeniedException::class)
    fun handleAccessDenied(ex: AccessDeniedException, req: HttpServletRequest): ResponseEntity<ErrorResponse> =
        ResponseEntity
            .status(HttpStatus.FORBIDDEN)
            .body(
                ErrorResponse(
                    status = 403,
                    error = "Forbidden",
                    message = ex.message ?: "Forbidden",
                    path = req.requestURI
                )
            )

    /**
     * Падения уникальных индексов в БД (email collision и т.п.). Без этого handler'а Spring
     * Security ловит исключение и мапит в 401 "Unauthorized" — очень мутно для юзера.
     */
    @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException::class)
    fun handleDataIntegrity(
        ex: org.springframework.dao.DataIntegrityViolationException,
        req: HttpServletRequest,
    ): ResponseEntity<ErrorResponse> {
        val root = ex.mostSpecificCause.message.orEmpty()
        val pretty = when {
            root.contains("users_email_key", ignoreCase = true) -> "Этот email уже зарегистрирован"
            root.contains("uk_users_telegram_user_id", ignoreCase = true) -> "Этот Telegram уже привязан к другому аккаунту"
            root.contains("uk_users_google_sub", ignoreCase = true) -> "Этот Google уже привязан к другому аккаунту"
            root.contains("uk_users_facebook_sub", ignoreCase = true) -> "Этот Facebook уже привязан к другому аккаунту"
            root.contains("uk_users_twitter_sub", ignoreCase = true) -> "Этот Twitter уже привязан к другому аккаунту"
            root.contains("players_name_key", ignoreCase = true) -> "Игрок с таким именем уже есть"
            else -> "Не удалось сохранить — конфликт данных"
        }
        return ResponseEntity.status(HttpStatus.CONFLICT).body(
            ErrorResponse(409, "Conflict", pretty, req.requestURI),
        )
    }
}

