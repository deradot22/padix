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
}

