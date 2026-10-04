package com.padelgo.api

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus
import jakarta.servlet.http.HttpServletRequest

/** 409 бывает и про занятое имя, и про занятый email — клиент различает их по полю code. */
class ApiExceptionHandlerTest {
    private val handler = ApiExceptionHandler()
    private val request = mock<HttpServletRequest>().also { whenever(it.requestURI).thenReturn("/api/auth/register") }

    private fun integrity(constraint: String) =
        DataIntegrityViolationException("save failed", RuntimeException("duplicate key value violates unique constraint \"$constraint\""))

    @Test
    fun `taken name from the unique index carries NAME_TAKEN`() {
        val body = handler.handleDataIntegrity(integrity("players_name_key"), request).body!!

        assertEquals(409, body.status)
        assertEquals(ApiErrorCodes.NAME_TAKEN, body.code)
    }

    @Test
    fun `taken email from the unique index carries EMAIL_TAKEN`() {
        val body = handler.handleDataIntegrity(integrity("users_email_key"), request).body!!

        assertEquals(ApiErrorCodes.EMAIL_TAKEN, body.code)
    }

    @Test
    fun `other constraint has no code`() {
        val body = handler.handleDataIntegrity(integrity("uk_users_google_sub"), request).body!!

        assertNull(body.code)
    }

    @Test
    fun `code of ApiException is passed through`() {
        val body = handler.handleApi(ApiException(HttpStatus.CONFLICT, "Имя уже занято", ApiErrorCodes.NAME_TAKEN), request).body!!

        assertEquals(ApiErrorCodes.NAME_TAKEN, body.code)
    }

    @Test
    fun `response without a code keeps the old shape`() {
        val body = handler.handleApi(ApiException(HttpStatus.NOT_FOUND, "Event not found"), request).body!!

        assertFalse(jacksonObjectMapper().writeValueAsString(body).contains("code"))
    }
}
