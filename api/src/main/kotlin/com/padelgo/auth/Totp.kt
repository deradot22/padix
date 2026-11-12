package com.padelgo.auth

import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * TOTP (RFC 6238) поверх HMAC-SHA1, шаг 30 секунд, 6 цифр — совместимо с Google Authenticator,
 * 1Password, Authy и т.п. Секрет хранится в base32 (RFC 4648) без паддинга.
 */
object Totp {
    const val STEP_SECONDS = 30L
    const val DIGITS = 6

    private const val BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

    fun generateSecret(bytes: Int = 20): String {
        val raw = ByteArray(bytes)
        SecureRandom().nextBytes(raw)
        return base32Encode(raw)
    }

    /** Код для заданного счётчика шагов (unixSeconds / 30). */
    fun codeAt(secretBase32: String, counter: Long): String {
        val key = base32Decode(secretBase32)
        val msg = ByteArray(8) { i -> (counter ushr (8 * (7 - i))).toByte() }
        val mac = Mac.getInstance("HmacSHA1")
        mac.init(SecretKeySpec(key, "HmacSHA1"))
        val hash = mac.doFinal(msg)
        val offset = hash[hash.size - 1].toInt() and 0x0f
        val binary = ((hash[offset].toInt() and 0x7f) shl 24) or
            ((hash[offset + 1].toInt() and 0xff) shl 16) or
            ((hash[offset + 2].toInt() and 0xff) shl 8) or
            (hash[offset + 3].toInt() and 0xff)
        val otp = binary % 1_000_000
        return otp.toString().padStart(DIGITS, '0')
    }

    /**
     * Проверяет код с допуском ±[window] шагов (часы телефона могут отставать).
     * Сравнение константное по времени, чтобы не утекало через тайминги.
     */
    fun verify(secretBase32: String, code: String?, nowSeconds: Long, window: Int = 1): Boolean {
        val normalized = code?.filter { it.isDigit() } ?: return false
        if (normalized.length != DIGITS) return false
        val counter = nowSeconds / STEP_SECONDS
        var ok = false
        for (delta in -window..window) {
            val expected = codeAt(secretBase32, counter + delta)
            if (MessageDigest.isEqual(expected.toByteArray(), normalized.toByteArray())) ok = true
        }
        return ok
    }

    fun otpauthUri(secretBase32: String, account: String, issuer: String = "Padix"): String =
        "otpauth://totp/${urlEncode("$issuer:$account")}?secret=$secretBase32&issuer=${urlEncode(issuer)}&digits=$DIGITS&period=$STEP_SECONDS"

    private fun urlEncode(s: String): String = java.net.URLEncoder.encode(s, Charsets.UTF_8).replace("+", "%20")

    fun base32Encode(data: ByteArray): String {
        val sb = StringBuilder()
        var buffer = 0
        var bitsLeft = 0
        for (b in data) {
            buffer = (buffer shl 8) or (b.toInt() and 0xff)
            bitsLeft += 8
            while (bitsLeft >= 5) {
                sb.append(BASE32_ALPHABET[(buffer shr (bitsLeft - 5)) and 0x1f])
                bitsLeft -= 5
            }
        }
        if (bitsLeft > 0) sb.append(BASE32_ALPHABET[(buffer shl (5 - bitsLeft)) and 0x1f])
        return sb.toString()
    }

    fun base32Decode(s: String): ByteArray {
        val clean = s.trim().uppercase().replace(" ", "").replace("-", "").trimEnd('=')
        val out = java.io.ByteArrayOutputStream()
        var buffer = 0
        var bitsLeft = 0
        for (ch in clean) {
            val v = BASE32_ALPHABET.indexOf(ch)
            require(v >= 0) { "Недопустимый символ base32: '$ch'" }
            buffer = (buffer shl 5) or v
            bitsLeft += 5
            if (bitsLeft >= 8) {
                out.write((buffer shr (bitsLeft - 8)) and 0xff)
                bitsLeft -= 8
            }
        }
        return out.toByteArray()
    }
}
