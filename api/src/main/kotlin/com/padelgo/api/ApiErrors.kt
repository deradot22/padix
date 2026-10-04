package com.padelgo.api

import org.springframework.http.HttpStatus

class ApiException(
    val status: HttpStatus,
    override val message: String,
    /** Машиночитаемая причина — клиент различает по ней ошибки с одинаковым HTTP-статусом. */
    val code: String? = null
) : RuntimeException(message)

object ApiErrorCodes {
    const val NAME_TAKEN = "NAME_TAKEN"
    const val EMAIL_TAKEN = "EMAIL_TAKEN"
}

