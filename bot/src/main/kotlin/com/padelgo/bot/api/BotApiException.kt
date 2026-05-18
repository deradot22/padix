package com.padelgo.bot.api

import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ControllerAdvice
import org.springframework.web.bind.annotation.ExceptionHandler

class BotApiException(
    val status: HttpStatus,
    override val message: String
) : RuntimeException(message)

data class BotErrorBody(
    val status: Int,
    val error: String,
    val message: String
)

@ControllerAdvice
class BotApiExceptionHandler {
    @ExceptionHandler(BotApiException::class)
    fun handle(e: BotApiException): ResponseEntity<BotErrorBody> =
        ResponseEntity.status(e.status).body(
            BotErrorBody(status = e.status.value(), error = e.status.reasonPhrase, message = e.message)
        )
}
