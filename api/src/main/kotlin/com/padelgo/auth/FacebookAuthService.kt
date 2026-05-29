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
 * Авторизация через Facebook Login.
 *
 * Поток:
 *  1. Фронт получает access_token через FB JS SDK (`FB.login({scope: "public_profile,email"})`).
 *  2. POST /api/auth/facebook { accessToken }.
 *  3. Бэк дважды дёргает Graph API:
 *      - /debug_token проверяет что токен выпущен для НАШЕГО app_id (защита от подмены).
 *      - /me?fields=id,email,first_name,last_name,picture забирает данные.
 *  4. Login по facebook_sub / auto-link по verified email / создание нового аккаунта.
 *
 * Facebook не отдаёт email_verified отдельно, но любой email который FB вернул считается
 * подтверждённым (FB верифицирует email при создании аккаунта).
 *
 * С 2022 года gender убрали из default scope — мы его не запрашиваем.
 */
@Service
class FacebookAuthService(
    private val users: UserRepository,
    private val players: PlayerRepository,
    private val jwt: JwtService,
    @Value("\${app.facebook.app-id:}") private val appId: String,
    @Value("\${app.facebook.app-secret:}") private val appSecret: String,
) {
    private val log = LoggerFactory.getLogger(FacebookAuthService::class.java)
    private val rng = SecureRandom()
    private val mapper = ObjectMapper()
    private val graph: RestClient = RestClient.builder()
        .baseUrl("https://graph.facebook.com")
        .build()

    /**
     * Используется при привязке Facebook к существующему юзеру (через [ProviderLinkService]).
     * Возвращает sub/email после верификации токена. Кидает 401 если токен невалиден.
     */
    fun verifyForLink(accessToken: String): FacebookVerifyInfo {
        if (appId.isBlank() || appSecret.isBlank()) {
            throw ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Facebook login is not configured on this server")
        }
        if (accessToken.isBlank()) throw ApiException(HttpStatus.BAD_REQUEST, "accessToken is required")
        verifyToken(accessToken)
        val profile = fetchProfile(accessToken)
        val sub = profile.id.ifBlank {
            throw ApiException(HttpStatus.UNAUTHORIZED, "Facebook profile missing id")
        }
        return FacebookVerifyInfo(sub = sub, email = profile.email?.trim()?.lowercase())
    }

    @Transactional
    fun loginOrRegister(accessToken: String): AuthResponse {
        if (appId.isBlank() || appSecret.isBlank()) {
            throw ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Facebook login is not configured on this server")
        }
        if (accessToken.isBlank()) {
            throw ApiException(HttpStatus.BAD_REQUEST, "accessToken is required")
        }

        verifyToken(accessToken)
        val profile = fetchProfile(accessToken)
        val sub = profile.id.ifBlank {
            throw ApiException(HttpStatus.UNAUTHORIZED, "Facebook profile missing id")
        }
        val email = profile.email?.trim()?.lowercase()
        val displayName = listOfNotNull(profile.firstName?.trim()?.ifBlank { null }, profile.lastName?.trim()?.ifBlank { null })
            .joinToString(" ")
            .ifBlank { email ?: "fb-$sub" }
        val avatar = profile.picture?.data?.url

        // 1) Уже линкован
        users.findByFacebookSub(sub)?.let { existing ->
            return AuthResponse(jwt.createToken(existing.id!!, existing.email, existing.playerId!!, false))
        }

        // 2) Авто-линк по email (FB email считаем верифицированным)
        if (email != null) {
            users.findByEmailIgnoreCase(email)?.let { existing ->
                existing.facebookSub = sub
                if (existing.emailVerifiedAt == null) existing.emailVerifiedAt = Instant.now()
                users.save(existing)
                return AuthResponse(jwt.createToken(existing.id!!, existing.email, existing.playerId!!, false))
            }
        }

        // 3) Новый юзер
        val player = players.save(
            Player(
                name = uniquePlayerName(displayName),
                rating = 1000,
                ntrp = Ntrp.fromRating(1000),
                gamesPlayed = 0,
                avatarUrl = avatar,
            )
        )
        val user = users.save(
            UserAccount(
                email = email,
                passwordHash = null,
                playerId = player.id!!,
                publicId = generatePublicId(),
                facebookSub = sub,
                emailVerifiedAt = if (email != null) Instant.now() else null,
            )
        )
        return AuthResponse(jwt.createToken(user.id!!, user.email, user.playerId!!, false))
    }

    /**
     * Дёргает /debug_token с app_access_token (=app_id|app_secret) — это не "secret" в смысле
     * утечки в логи, а конкатенация как требует Facebook API. Возвращает метаданные токена;
     * мы проверяем что app_id в токене совпадает с нашим.
     */
    private fun verifyToken(accessToken: String) {
        val appAccessToken = "$appId|$appSecret"
        val body = try {
            graph.get()
                .uri { it.path("/debug_token").queryParam("input_token", accessToken).queryParam("access_token", appAccessToken).build() }
                .retrieve()
                .body(String::class.java) ?: throw ApiException(HttpStatus.UNAUTHORIZED, "Empty response from Facebook")
        } catch (e: ApiException) {
            throw e
        } catch (e: Exception) {
            log.warn("[FB-AUTH] debug_token call failed: {}", e.message)
            throw ApiException(HttpStatus.UNAUTHORIZED, "Failed to verify Facebook token")
        }
        val info = try {
            mapper.readValue(body, FacebookDebugTokenResponse::class.java)
        } catch (e: Exception) {
            throw ApiException(HttpStatus.UNAUTHORIZED, "Malformed debug_token response")
        }
        val data = info.data ?: throw ApiException(HttpStatus.UNAUTHORIZED, "Invalid Facebook token")
        if (data.appId != appId) {
            log.warn("[FB-AUTH] app_id mismatch: expected={} got={}", appId, data.appId)
            throw ApiException(HttpStatus.UNAUTHORIZED, "Facebook token issued for different app")
        }
        if (data.isValid != true) {
            throw ApiException(HttpStatus.UNAUTHORIZED, "Facebook token is invalid or expired")
        }
    }

    private fun fetchProfile(accessToken: String): FacebookProfile {
        val body = try {
            graph.get()
                .uri {
                    it.path("/me")
                        .queryParam("fields", "id,email,first_name,last_name,picture.type(large)")
                        .queryParam("access_token", accessToken)
                        .build()
                }
                .retrieve()
                .body(String::class.java) ?: throw ApiException(HttpStatus.UNAUTHORIZED, "Empty profile response")
        } catch (e: ApiException) {
            throw e
        } catch (e: Exception) {
            log.warn("[FB-AUTH] /me call failed: {}", e.message)
            throw ApiException(HttpStatus.UNAUTHORIZED, "Failed to fetch Facebook profile")
        }
        return try {
            mapper.readValue(body, FacebookProfile::class.java)
        } catch (e: Exception) {
            throw ApiException(HttpStatus.UNAUTHORIZED, "Malformed Facebook profile response")
        }
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

/** Результат верификации FB-токена для привязки к существующему юзеру. */
data class FacebookVerifyInfo(
    val sub: String,
    val email: String?,
)

// Все Facebook DTO с @JsonIgnoreProperties — Graph API часто кладёт extra поля
// (например `scopes`, `user_id`, `application`, `metadata`), а мы декодим лишь подмножество.

@JsonIgnoreProperties(ignoreUnknown = true)
private data class FacebookDebugTokenResponse(
    val data: FacebookDebugData? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class FacebookDebugData(
    @JsonProperty("app_id") val appId: String? = null,
    @JsonProperty("is_valid") val isValid: Boolean? = null,
    @JsonProperty("user_id") val userId: String? = null,
    @JsonProperty("expires_at") val expiresAt: Long? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class FacebookProfile(
    val id: String = "",
    val email: String? = null,
    @JsonProperty("first_name") val firstName: String? = null,
    @JsonProperty("last_name") val lastName: String? = null,
    val picture: FacebookPicture? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class FacebookPicture(
    val data: FacebookPictureData? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class FacebookPictureData(
    val url: String? = null,
)
