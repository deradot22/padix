package com.padelgo.auth

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.ObjectMapper
import com.padelgo.api.ApiException
import com.padelgo.domain.Player
import com.padelgo.repo.PlayerRepository
import com.padelgo.service.Ntrp
import jakarta.transaction.Transactional
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient
import java.security.SecureRandom
import java.time.Instant

/**
 * Авторизация через Google Sign-In.
 *
 * Поток:
 *  1. Юзер жмёт «Войти через Google» на /login или /register.
 *  2. Google Identity Services (фронт) показывает их UI, юзер логинится.
 *  3. Виджет возвращает `credential` — это ID-токен (JWT, подписанный Google).
 *  4. Фронт POST'ит { idToken: credential } в /api/auth/google.
 *  5. Бэк проверяет токен через https://oauth2.googleapis.com/tokeninfo?id_token=<JWT>.
 *     Google возвращает декодированные claims если подпись валидна, иначе HTTP 400.
 *  6. Бэк сверяет:
 *      - aud == GOOGLE_CLIENT_ID (адресован нашему приложению)
 *      - iss это accounts.google.com (или с https://)
 *      - exp > now (не истёк)
 *  7. Дальше: ищем по google_sub → логиним; если нет — ищем по email + email_verified → авто-линк;
 *     иначе создаём нового юзера с данными от Google.
 */
@Service
class GoogleAuthService(
    private val users: UserRepository,
    private val players: PlayerRepository,
    private val jwt: JwtService,
    @Value("\${app.google.client-id:}") private val clientId: String,
) {
    private val log = LoggerFactory.getLogger(GoogleAuthService::class.java)
    private val rng = SecureRandom()
    private val mapper = ObjectMapper()
    private val tokenInfoClient: RestClient = RestClient.builder()
        .baseUrl("https://oauth2.googleapis.com")
        .build()

    /**
     * Используется при привязке Google к существующему юзеру (через [ProviderLinkService]).
     * Возвращает sub/email из verified ID-токена. Кидает 401 если токен невалиден.
     */
    fun verifyForLink(idToken: String): GoogleVerifyInfo {
        if (clientId.isBlank()) {
            throw ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Google login is not configured on this server")
        }
        val claims = verifyIdToken(idToken)
        val sub = claims.sub.ifBlank {
            throw ApiException(HttpStatus.UNAUTHORIZED, "Google token missing sub")
        }
        return GoogleVerifyInfo(
            sub = sub,
            email = claims.email?.trim()?.lowercase(),
            emailVerified = claims.emailVerified == "true",
        )
    }

    @Transactional
    fun loginOrRegister(idToken: String): AuthResponse {
        if (clientId.isBlank()) {
            throw ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Google login is not configured on this server")
        }
        val claims = verifyIdToken(idToken)
        val sub = claims.sub.ifBlank {
            throw ApiException(HttpStatus.UNAUTHORIZED, "Google token missing sub")
        }
        val email = claims.email?.trim()?.lowercase()
        val emailVerified = claims.emailVerified == "true"
        val name = claims.name?.trim()?.ifBlank { null }
            ?: claims.givenName?.trim()?.ifBlank { null }
            ?: email
            ?: "google-$sub"

        // 1) Пробуем найти по google_sub — уже линкованный аккаунт
        val byGoogle = users.findByGoogleSub(sub)
        if (byGoogle != null) {
            return AuthResponse(jwt.createToken(byGoogle.id!!, byGoogle.email, byGoogle.playerId!!, false))
        }

        // 2) Авто-линк по email (если verified) — юзер ранее регался по паролю с тем же email
        if (email != null && emailVerified) {
            val byEmail = users.findByEmailIgnoreCase(email)
            if (byEmail != null) {
                byEmail.googleSub = sub
                // Раз Google говорит что email подтверждён — можно засчитать.
                if (byEmail.emailVerifiedAt == null) byEmail.emailVerifiedAt = Instant.now()
                users.save(byEmail)
                return AuthResponse(jwt.createToken(byEmail.id!!, byEmail.email, byEmail.playerId!!, false))
            }
        }

        // 3) Новый юзер — создаём аккаунт + player. Avatar и emailVerified берём от Google.
        val player = players.save(
            Player(
                name = uniquePlayerName(name),
                rating = 1000,
                ntrp = Ntrp.fromRating(1000),
                gamesPlayed = 0,
                avatarUrl = claims.picture,
            )
        )
        val user = users.save(
            UserAccount(
                email = email,
                passwordHash = null,
                playerId = player.id!!,
                publicId = generatePublicId(),
                googleSub = sub,
                emailVerifiedAt = if (email != null && emailVerified) Instant.now() else null,
            )
        )
        return AuthResponse(jwt.createToken(user.id!!, user.email, user.playerId!!, false))
    }

    /**
     * Дёргает Google tokeninfo endpoint. Google валидирует подпись + срок жизни и возвращает claims.
     * Если 4xx — токен невалиден.
     */
    private fun verifyIdToken(idToken: String): GoogleTokenClaims {
        val responseBody: String = try {
            tokenInfoClient.get()
                .uri { it.path("/tokeninfo").queryParam("id_token", idToken).build() }
                .retrieve()
                .body(String::class.java)
                ?: throw ApiException(HttpStatus.UNAUTHORIZED, "Empty response from Google")
        } catch (e: ApiException) {
            throw e
        } catch (e: Exception) {
            log.warn("[GOOGLE-AUTH] tokeninfo call failed: {}", e.message)
            throw ApiException(HttpStatus.UNAUTHORIZED, "Invalid Google token")
        }
        val claims = try {
            mapper.readValue(responseBody, GoogleTokenClaims::class.java)
        } catch (e: Exception) {
            log.warn("[GOOGLE-AUTH] failed to parse tokeninfo response: {} body={}", e.message, responseBody)
            throw ApiException(HttpStatus.UNAUTHORIZED, "Malformed Google token response")
        }

        // Audience: токен должен быть выпущен для НАШЕГО клиентского ID, иначе атакующий мог бы взять
        // валидный токен от другого приложения и подсунуть нам.
        if (claims.aud != clientId) {
            log.warn("[GOOGLE-AUTH] aud mismatch: expected={} got={}", clientId, claims.aud)
            throw ApiException(HttpStatus.UNAUTHORIZED, "Google token audience mismatch")
        }
        // Issuer
        if (claims.iss != "accounts.google.com" && claims.iss != "https://accounts.google.com") {
            throw ApiException(HttpStatus.UNAUTHORIZED, "Google token issuer mismatch")
        }
        // Срок жизни — endpoint уже это проверяет, но double-check на всякий
        val expEpoch = claims.exp?.toLongOrNull() ?: 0L
        if (expEpoch <= System.currentTimeMillis() / 1000) {
            throw ApiException(HttpStatus.UNAUTHORIZED, "Google token expired")
        }
        return claims
    }

    private fun uniquePlayerName(base: String): String {
        val existing = players.findByNameIgnoreCase(base)
        if (existing == null) return base
        repeat(10) {
            val candidate = "$base #${rng.nextInt(9000) + 1000}"
            if (players.findByNameIgnoreCase(candidate) == null) return candidate
        }
        return "$base #${System.currentTimeMillis() % 100000}"
    }

    private fun generatePublicId(): Long {
        repeat(10) {
            val candidate = 100_000_000L + (rng.nextDouble() * 900_000_000L).toLong()
            if (users.findByPublicId(candidate) == null) return candidate
        }
        throw ApiException(HttpStatus.CONFLICT, "Failed to generate public id")
    }
}

/** Результат верификации Google ID-токена для привязки к существующему юзеру. */
data class GoogleVerifyInfo(
    val sub: String,
    val email: String?,
    val emailVerified: Boolean,
)

/**
 * Подмножество claim'ов, которое возвращает tokeninfo endpoint.
 * `@JsonIgnoreProperties` обязательно — Google возвращает много служебных полей
 * (`azp`, `iat`, `nonce`, `jti`, `at_hash`, `locale`, ...), без этого Jackson падает.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
private data class GoogleTokenClaims(
    @JsonProperty("sub") val sub: String = "",
    @JsonProperty("aud") val aud: String? = null,
    @JsonProperty("iss") val iss: String? = null,
    @JsonProperty("exp") val exp: String? = null,
    @JsonProperty("email") val email: String? = null,
    /** Google возвращает как строку "true"/"false", не как boolean. */
    @JsonProperty("email_verified") val emailVerified: String? = null,
    @JsonProperty("name") val name: String? = null,
    @JsonProperty("given_name") val givenName: String? = null,
    @JsonProperty("family_name") val familyName: String? = null,
    @JsonProperty("picture") val picture: String? = null,
)
