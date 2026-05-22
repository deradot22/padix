package com.padelgo.auth

import com.padelgo.api.ApiException
import jakarta.transaction.Transactional
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.Instant
import java.util.UUID

/**
 * Привязка/отвязка OAuth-провайдеров к существующему юзеру.
 *
 * Все link-методы проверяют:
 *  - токен/payload валиден (через соответствующий provider service)
 *  - sub не используется другим юзером (иначе бы кто-то мог «угнать» провайдера)
 *
 * Unlink проверяет:
 *  - юзер останется с минимум одним способом входа (пароль или хотя бы один OAuth)
 *  - иначе 400 «Сначала установите пароль или привяжите другой провайдер»
 */
@Service
class ProviderLinkService(
    private val users: UserRepository,
    private val telegramAuth: TelegramAuthService,
    private val googleAuth: GoogleAuthService,
    private val facebookAuth: FacebookAuthService,
    private val authService: AuthService,
) {

    enum class Provider { TELEGRAM, GOOGLE, FACEBOOK, TWITTER }

    /**
     * Verifies Telegram payload, ensures id not used by another user, sets it on current user.
     */
    @Transactional
    fun linkTelegram(principal: JwtPrincipal, req: TelegramAuthRequest): MeResponse {
        val user = loadUser(principal)
        // Используем общую логику верификации Telegram-payload через специальный метод сервиса.
        // Здесь повторно проводим валидацию HMAC без создания нового аккаунта.
        telegramAuth.verifyForLink(req)
        ensureSubAvailable(Provider.TELEGRAM, req.id.toString(), user.id)
        user.telegramUserId = req.id
        user.telegramUsername = req.username ?: user.telegramUsername
        user.telegramPhotoUrl = req.photoUrl ?: user.telegramPhotoUrl
        users.save(user)
        return authService.me(principal)
    }

    @Transactional
    fun linkGoogle(principal: JwtPrincipal, idToken: String): MeResponse {
        val user = loadUser(principal)
        val info = googleAuth.verifyForLink(idToken)
        ensureSubAvailable(Provider.GOOGLE, info.sub, user.id)
        user.googleSub = info.sub
        if (info.emailVerified && user.emailVerifiedAt == null && info.email != null
            && user.email.equals(info.email, ignoreCase = true)
        ) {
            user.emailVerifiedAt = Instant.now()
        }
        users.save(user)
        return authService.me(principal)
    }

    @Transactional
    fun linkFacebook(principal: JwtPrincipal, accessToken: String): MeResponse {
        val user = loadUser(principal)
        val info = facebookAuth.verifyForLink(accessToken)
        ensureSubAvailable(Provider.FACEBOOK, info.sub, user.id)
        user.facebookSub = info.sub
        users.save(user)
        return authService.me(principal)
    }

    /**
     * Отвязка. Проверяем что у юзера останется хотя бы один способ входа.
     */
    @Transactional
    fun unlink(principal: JwtPrincipal, provider: Provider): MeResponse {
        val user = loadUser(principal)
        val remainingMethods = countAuthMethods(user) - (if (hasProvider(user, provider)) 1 else 0)
        if (remainingMethods < 1) {
            throw ApiException(
                HttpStatus.BAD_REQUEST,
                "Это единственный способ входа. Сначала установите пароль или привяжите другой провайдер."
            )
        }
        when (provider) {
            Provider.TELEGRAM -> {
                user.telegramUserId = null
                user.telegramUsername = null
                user.telegramPhotoUrl = null
            }
            Provider.GOOGLE -> user.googleSub = null
            Provider.FACEBOOK -> user.facebookSub = null
            Provider.TWITTER -> user.twitterSub = null
        }
        users.save(user)
        return authService.me(principal)
    }

    private fun loadUser(principal: JwtPrincipal): UserAccount =
        users.findById(principal.userId).orElseThrow { ApiException(HttpStatus.UNAUTHORIZED, "User not found") }

    private fun ensureSubAvailable(provider: Provider, sub: String, currentUserId: UUID?) {
        val taken = when (provider) {
            Provider.TELEGRAM -> users.findByTelegramUserId(sub.toLong())
            Provider.GOOGLE -> users.findByGoogleSub(sub)
            Provider.FACEBOOK -> users.findByFacebookSub(sub)
            Provider.TWITTER -> users.findByTwitterSub(sub)
        }
        if (taken != null && taken.id != currentUserId) {
            throw ApiException(HttpStatus.CONFLICT, "Этот ${provider.name.lowercase().replaceFirstChar { it.uppercase() }} уже привязан к другому аккаунту")
        }
    }

    private fun hasProvider(user: UserAccount, provider: Provider): Boolean = when (provider) {
        Provider.TELEGRAM -> user.telegramUserId != null
        Provider.GOOGLE -> user.googleSub != null
        Provider.FACEBOOK -> user.facebookSub != null
        Provider.TWITTER -> user.twitterSub != null
    }

    private fun countAuthMethods(user: UserAccount): Int =
        listOf(
            !user.passwordHash.isNullOrBlank(),
            user.telegramUserId != null,
            user.googleSub != null,
            user.facebookSub != null,
            user.twitterSub != null,
        ).count { it }
}
