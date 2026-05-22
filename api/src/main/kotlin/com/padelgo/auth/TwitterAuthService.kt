package com.padelgo.auth

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.ObjectMapper
import com.padelgo.api.ApiException
import com.padelgo.domain.Player
import com.padelgo.repo.PlayerRepository
import com.padelgo.service.Ntrp
import jakarta.transaction.Transactional
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.stereotype.Service
import org.springframework.util.LinkedMultiValueMap
import org.springframework.web.client.RestClient
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Base64
import java.util.UUID

/**
 * Авторизация через Twitter/X (OAuth 2.0 Authorization Code Flow with PKCE).
 *
 * Поток:
 *  1. Фронт GET /api/auth/twitter/start → бэк генерит state+PKCE, сохраняет в oauth_state,
 *     отдаёт URL на twitter authorize. Фронт делает window.location = url.
 *  2. Юзер на x.com подтверждает доступ. Twitter редиректит на /api/auth/twitter/callback?code=&state=.
 *  3. Бэк находит state в oauth_state (защита от CSRF), exchange code → access_token через
 *     api.x.com/2/oauth2/token (POST с Basic Auth client_id:client_secret).
 *  4. GET https://api.x.com/2/users/me?user.fields=id,name,username,profile_image_url
 *  5. Login/register, формируем JWT, редиректим юзера на фронт:
 *        {APP_PUBLIC_BASE_URL}/auth/oauth-callback#token=<JWT>
 *     (токен в hash чтобы не попал в access_log).
 *
 * Twitter НЕ отдаёт email по default scope — пользователь добавит позже в настройках.
 */
@Service
class TwitterAuthService(
    private val users: UserRepository,
    private val players: PlayerRepository,
    private val stateRepo: OAuthStateRepository,
    private val jwt: JwtService,
    @Value("\${app.twitter.client-id:}") private val clientId: String,
    @Value("\${app.twitter.client-secret:}") private val clientSecret: String,
    @Value("\${app.public-base-url:http://localhost:8083}") private val publicBaseUrl: String,
    @Value("\${app.api-public-base-url:http://localhost:8080}") private val apiPublicBaseUrl: String,
) {
    private val log = LoggerFactory.getLogger(TwitterAuthService::class.java)
    private val rng = SecureRandom()
    private val mapper = ObjectMapper()
    private val xClient: RestClient = RestClient.create()

    /**
     * Шаг 1: подготовить state+PKCE, вернуть Twitter authorize URL.
     * Если linkUserId != null — это flow привязки (используется из Настроек), иначе чистый login.
     */
    @Transactional
    fun buildAuthorizeUrl(linkUserId: UUID? = null): String {
        if (clientId.isBlank() || clientSecret.isBlank()) {
            throw ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Twitter login is not configured on this server")
        }
        val state = randomToken(32)
        val codeVerifier = randomToken(48)
        val codeChallenge = base64UrlSha256(codeVerifier)
        stateRepo.save(
            OAuthState(
                state = state,
                provider = "TWITTER",
                codeVerifier = codeVerifier,
                linkUserId = linkUserId,
                expiresAt = Instant.now().plus(10, ChronoUnit.MINUTES),
            )
        )
        val redirectUri = "$apiPublicBaseUrl/api/auth/twitter/callback"
        val params = listOf(
            "response_type" to "code",
            "client_id" to clientId,
            "redirect_uri" to redirectUri,
            "scope" to "users.read tweet.read offline.access",
            "state" to state,
            "code_challenge" to codeChallenge,
            "code_challenge_method" to "S256",
        )
        val query = params.joinToString("&") { (k, v) ->
            "${URLEncoder.encode(k, "UTF-8")}=${URLEncoder.encode(v, "UTF-8")}"
        }
        return "https://x.com/i/oauth2/authorize?$query"
    }

    /**
     * Шаг 2-4: callback от Twitter. Возвращает URL для редиректа фронта (с JWT в hash) или с ошибкой.
     */
    @Transactional
    fun handleCallback(code: String?, state: String?, errorParam: String?): String {
        // Twitter может вернуть с error= (юзер отменил).
        if (!errorParam.isNullOrBlank()) {
            log.info("[TWITTER-AUTH] user cancelled or error: {}", errorParam)
            return frontendRedirect(error = "twitter_cancelled")
        }
        if (code.isNullOrBlank() || state.isNullOrBlank()) {
            return frontendRedirect(error = "twitter_invalid_callback")
        }
        val stored = stateRepo.findById(state).orElse(null)
            ?: return frontendRedirect(error = "twitter_state_unknown")
        stateRepo.delete(stored)
        if (stored.expiresAt.isBefore(Instant.now())) {
            return frontendRedirect(error = "twitter_state_expired")
        }
        if (stored.provider != "TWITTER") {
            return frontendRedirect(error = "twitter_state_provider_mismatch")
        }

        val tokenResponse = try {
            exchangeCodeForToken(code, stored.codeVerifier)
        } catch (e: Exception) {
            log.warn("[TWITTER-AUTH] token exchange failed: {}", e.message)
            return frontendRedirect(error = "twitter_token_exchange_failed")
        }
        val profile = try {
            fetchProfile(tokenResponse.accessToken)
        } catch (e: Exception) {
            log.warn("[TWITTER-AUTH] /users/me failed: {}", e.message)
            return frontendRedirect(error = "twitter_profile_fetch_failed")
        }

        val jwtToken = try {
            loginOrRegister(profile, linkUserId = stored.linkUserId)
        } catch (e: ApiException) {
            return frontendRedirect(error = "twitter_${e.status.value()}")
        }
        return frontendRedirect(token = jwtToken)
    }

    @Transactional
    private fun loginOrRegister(profile: TwitterUserResponse, linkUserId: UUID?): String {
        val sub = profile.data?.id?.takeIf { it.isNotBlank() }
            ?: throw ApiException(HttpStatus.UNAUTHORIZED, "Twitter profile missing id")
        val name = profile.data.name?.trim()?.ifBlank { null }
            ?: profile.data.username?.trim()?.ifBlank { null }
            ?: "tw-$sub"
        val avatar = profile.data.profileImageUrl?.replace("_normal.", "_400x400.")

        // Если это flow привязки — линкуем к существующему юзеру.
        if (linkUserId != null) {
            val user = users.findById(linkUserId).orElseThrow {
                ApiException(HttpStatus.NOT_FOUND, "User not found for linking")
            }
            val collision = users.findByTwitterSub(sub)
            if (collision != null && collision.id != user.id) {
                throw ApiException(HttpStatus.CONFLICT, "This Twitter account is linked to another user")
            }
            user.twitterSub = sub
            users.save(user)
            return jwt.createToken(user.id!!, user.email, user.playerId!!, false)
        }

        // 1) Уже линкован
        users.findByTwitterSub(sub)?.let { existing ->
            return jwt.createToken(existing.id!!, existing.email, existing.playerId!!, false)
        }

        // 2) Twitter не отдаёт email → авто-линк по email невозможен. Создаём нового юзера.
        val player = players.save(
            Player(
                name = uniquePlayerName(name),
                rating = 1000,
                ntrp = Ntrp.fromRating(1000),
                gamesPlayed = 0,
                avatarUrl = avatar,
            )
        )
        val user = users.save(
            UserAccount(
                email = null,
                passwordHash = null,
                playerId = player.id!!,
                publicId = generatePublicId(),
                twitterSub = sub,
            )
        )
        return jwt.createToken(user.id!!, user.email, user.playerId!!, false)
    }

    private fun exchangeCodeForToken(code: String, codeVerifier: String): TwitterTokenResponse {
        val redirectUri = "$apiPublicBaseUrl/api/auth/twitter/callback"
        val basicAuth = Base64.getEncoder().encodeToString("$clientId:$clientSecret".toByteArray(Charsets.UTF_8))
        val form = LinkedMultiValueMap<String, String>().apply {
            add("code", code)
            add("grant_type", "authorization_code")
            add("client_id", clientId)
            add("redirect_uri", redirectUri)
            add("code_verifier", codeVerifier)
        }
        val body = xClient.post()
            .uri("https://api.x.com/2/oauth2/token")
            .header(HttpHeaders.AUTHORIZATION, "Basic $basicAuth")
            .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_FORM_URLENCODED_VALUE)
            .body(form)
            .retrieve()
            .body(String::class.java) ?: throw ApiException(HttpStatus.UNAUTHORIZED, "Empty token response")
        return mapper.readValue(body, TwitterTokenResponse::class.java)
    }

    private fun fetchProfile(accessToken: String): TwitterUserResponse {
        val body = xClient.get()
            .uri("https://api.x.com/2/users/me?user.fields=id,name,username,profile_image_url")
            .header(HttpHeaders.AUTHORIZATION, "Bearer $accessToken")
            .retrieve()
            .body(String::class.java) ?: throw ApiException(HttpStatus.UNAUTHORIZED, "Empty profile response")
        return mapper.readValue(body, TwitterUserResponse::class.java)
    }

    /**
     * Формирует URL фронта для редиректа после callback'а. Токен идёт в hash (#token=) чтобы
     * не попасть в access_log серверов — hash отправляется браузером только в JS, не в HTTP.
     */
    private fun frontendRedirect(token: String? = null, error: String? = null): String {
        val base = "${publicBaseUrl.trimEnd('/')}/auth/oauth-callback"
        val fragment = listOfNotNull(
            token?.let { "token=${URLEncoder.encode(it, "UTF-8")}" },
            error?.let { "error=${URLEncoder.encode(it, "UTF-8")}" },
        ).joinToString("&")
        return if (fragment.isEmpty()) base else "$base#$fragment"
    }

    private fun randomToken(bytes: Int): String {
        val buf = ByteArray(bytes)
        rng.nextBytes(buf)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf)
    }

    private fun base64UrlSha256(s: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        val digest = md.digest(s.toByteArray(StandardCharsets.UTF_8))
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest)
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

private data class TwitterTokenResponse(
    @JsonProperty("access_token") val accessToken: String = "",
    @JsonProperty("token_type") val tokenType: String? = null,
    @JsonProperty("expires_in") val expiresIn: Long? = null,
    @JsonProperty("refresh_token") val refreshToken: String? = null,
    val scope: String? = null,
)

private data class TwitterUserResponse(
    val data: TwitterUserData? = null,
)

private data class TwitterUserData(
    val id: String? = null,
    val name: String? = null,
    val username: String? = null,
    @JsonProperty("profile_image_url") val profileImageUrl: String? = null,
)
