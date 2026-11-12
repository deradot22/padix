package com.padelgo.auth

import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Проверка TOTP по тест-векторам RFC 6238 (секрет "12345678901234567890", HMAC-SHA1):
 * последние 6 цифр эталонных 8-значных кодов.
 */
class TotpTest {
    private val rfcSecretBase32 = Totp.base32Encode("12345678901234567890".toByteArray())

    @Test
    fun `base32 encode and decode roundtrip`() {
        assertEquals("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", rfcSecretBase32)
        assertArrayEquals("12345678901234567890".toByteArray(), Totp.base32Decode(rfcSecretBase32))
        assertArrayEquals("12345678901234567890".toByteArray(), Totp.base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq"))
    }

    @Test
    fun `codes match RFC 6238 vectors`() {
        assertEquals("287082", Totp.codeAt(rfcSecretBase32, 59 / 30))
        assertEquals("081804", Totp.codeAt(rfcSecretBase32, 1111111109 / 30))
        assertEquals("050471", Totp.codeAt(rfcSecretBase32, 1111111111 / 30))
        assertEquals("005924", Totp.codeAt(rfcSecretBase32, 1234567890 / 30))
        assertEquals("279037", Totp.codeAt(rfcSecretBase32, 2000000000 / 30))
    }

    @Test
    fun `verify accepts current and neighbouring steps, rejects others`() {
        val now = 1111111109L
        assertTrue(Totp.verify(rfcSecretBase32, "081804", now))
        assertTrue(Totp.verify(rfcSecretBase32, "081 804", now))
        assertTrue(Totp.verify(rfcSecretBase32, "050471", now), "следующий шаг в окне ±1")
        assertFalse(Totp.verify(rfcSecretBase32, "287082", now), "код с другого времени")
        assertFalse(Totp.verify(rfcSecretBase32, "12345", now))
        assertFalse(Totp.verify(rfcSecretBase32, null, now))
        assertFalse(Totp.verify(rfcSecretBase32, "", now))
    }

    @Test
    fun `generated secret is valid base32 of 20 bytes`() {
        val secret = Totp.generateSecret()
        assertEquals(32, secret.length)
        assertEquals(20, Totp.base32Decode(secret).size)
        assertTrue(Totp.otpauthUri(secret, "owner").startsWith("otpauth://totp/Padix%3Aowner?secret=$secret&issuer=Padix"))
    }
}
