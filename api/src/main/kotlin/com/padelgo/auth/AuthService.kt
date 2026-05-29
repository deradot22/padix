package com.padelgo.auth

import com.padelgo.api.ApiException
import com.padelgo.repo.PlayerRepository
import com.padelgo.service.Ntrp
import jakarta.transaction.Transactional
import org.springframework.http.HttpStatus
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import java.security.SecureRandom
import java.util.UUID

@Service
class AuthService(
    private val users: UserRepository,
    private val players: PlayerRepository,
    private val encoder: PasswordEncoder,
    private val jwt: JwtService,
    private val emailVerification: EmailVerificationService,
    private val disposableEmailChecker: DisposableEmailChecker,
) {
    private val rng = SecureRandom()

    @Transactional
    fun register(req: RegisterRequest): AuthResponse {
        val email = req.email.trim().lowercase()
        if (disposableEmailChecker.isDisposable(email)) {
            throw ApiException(HttpStatus.BAD_REQUEST, "Используйте, пожалуйста, постоянный email-адрес")
        }
        if (users.findByEmailIgnoreCase(email) != null) throw ApiException(HttpStatus.CONFLICT, "Email already registered")

        val player = players.save(
            com.padelgo.domain.Player(
                name = req.name.trim(),
                rating = 1000,
                ntrp = Ntrp.fromRating(1000),
                gamesPlayed = 0
            )
        )
        val gender = req.gender?.trim()?.uppercase()?.takeIf { it in listOf("M", "F") }
        val user = users.save(
            UserAccount(
                email = email,
                passwordHash = encoder.encode(req.password),
                playerId = player.id!!,
                publicId = generatePublicId(),
                gender = gender,
                emailVerifiedAt = null,
            )
        )
        // Письмо с верификацией. Регистрацию не валим если SMTP упал —
        // юзер сможет нажать «выслать повторно» из настроек.
        emailVerification.sendVerificationEmail(user, player.name, EmailVerificationPurpose.REGISTRATION)
        return AuthResponse(jwt.createToken(user.id!!, user.email, user.playerId!!, false))
    }

    /**
     * Установить или сменить пароль.
     *  - Если у юзера уже есть пароль (hasPassword) — currentPassword обязателен и должен совпадать.
     *  - Если пароля нет (OAuth-only юзер) — currentPassword можно опустить.
     * Минимальная длина — 6 символов.
     */
    @Transactional
    fun setPassword(principal: JwtPrincipal, currentPassword: String?, newPassword: String) {
        if (newPassword.length < 6) {
            throw ApiException(HttpStatus.BAD_REQUEST, "Пароль должен быть не короче 6 символов")
        }
        val user = users.findById(principal.userId).orElseThrow { ApiException(HttpStatus.UNAUTHORIZED, "User not found") }
        val existingHash = user.passwordHash
        if (!existingHash.isNullOrBlank()) {
            // У юзера уже есть пароль — требуем текущий
            if (currentPassword.isNullOrBlank()) {
                throw ApiException(HttpStatus.BAD_REQUEST, "Введите текущий пароль")
            }
            if (!encoder.matches(currentPassword, existingHash)) {
                throw ApiException(HttpStatus.UNAUTHORIZED, "Текущий пароль неверный")
            }
        }
        user.passwordHash = encoder.encode(newPassword)
        users.save(user)
    }

    /**
     * Повторная отправка письма верификации текущему юзеру.
     * Старые активные токены деактивируются в [EmailVerificationService.sendVerificationEmail].
     */
    @Transactional
    fun resendVerification(principal: JwtPrincipal) {
        val user = users.findById(principal.userId).orElseThrow { ApiException(HttpStatus.UNAUTHORIZED, "User not found") }
        if (user.disabled) throw ApiException(HttpStatus.FORBIDDEN, "Account disabled")
        if (user.emailVerifiedAt != null) {
            throw ApiException(HttpStatus.BAD_REQUEST, "Email already verified")
        }
        val player = players.findById(user.playerId!!).orElseThrow { ApiException(HttpStatus.UNAUTHORIZED, "Player not found") }
        emailVerification.sendVerificationEmail(user, player.name, EmailVerificationPurpose.RESEND)
    }

    fun login(req: LoginRequest): AuthResponse {
        val email = req.email.trim().lowercase()
        val user = users.findByEmailIgnoreCase(email) ?: throw ApiException(HttpStatus.UNAUTHORIZED, "Неверный email или пароль")
        if (user.disabled) throw ApiException(HttpStatus.FORBIDDEN, "Аккаунт заблокирован")
        // OAuth-only юзер (зарегался через Telegram/Google) — пароль не задавал, логин по паролю невозможен
        // пока он не задаст пароль через настройки.
        val hash = user.passwordHash
            ?: throw ApiException(HttpStatus.UNAUTHORIZED, "Этот аккаунт зарегистрирован через внешний сервис. Войдите тем же способом или задайте пароль в настройках.")
        if (!encoder.matches(req.password, hash)) throw ApiException(HttpStatus.UNAUTHORIZED, "Неверный email или пароль")
        return AuthResponse(jwt.createToken(user.id!!, user.email, user.playerId!!, false))
    }

    fun me(principal: JwtPrincipal): MeResponse {
        val user = users.findById(principal.userId).orElseThrow { ApiException(HttpStatus.UNAUTHORIZED, "User not found") }
        if (user.disabled) throw ApiException(HttpStatus.FORBIDDEN, "Account disabled")
        val player = players.findById(user.playerId!!).orElseThrow { ApiException(HttpStatus.UNAUTHORIZED, "Player not found") }
        return MeResponse(
            email = user.email,
            playerId = player.id!!,
            name = player.name,
            rating = player.rating,
            ntrp = player.ntrp,
            gamesPlayed = player.gamesPlayed,
            publicId = formatPublicId(user.publicId),
            surveyCompleted = user.surveyCompleted,
            surveyLevel = user.surveyLevel,
            calibrationEventsRemaining = user.calibrationEventsRemaining,
            calibrationMatchesRemaining = user.calibrationMatchesRemaining,
            avatarUrl = player.avatarUrl,
            gender = user.gender,
            showWinProbability = user.showWinProbability,
            emailVerified = user.emailVerifiedAt != null,
            hasPassword = !user.passwordHash.isNullOrBlank(),
            authProviders = AuthProvidersInfo(
                telegram = user.telegramUserId != null,
                google = user.googleSub != null,
                facebook = user.facebookSub != null,
                twitter = user.twitterSub != null,
            ),
        )
    }

    @Transactional
    fun updateAvatar(principal: JwtPrincipal, req: UpdateAvatarRequest): MeResponse {
        val user = users.findById(principal.userId).orElseThrow { ApiException(HttpStatus.UNAUTHORIZED, "User not found") }
        if (user.disabled) throw ApiException(HttpStatus.FORBIDDEN, "Account disabled")
        val player = players.findById(user.playerId!!).orElseThrow { ApiException(HttpStatus.UNAUTHORIZED, "Player not found") }
        val avatar = req.avatarDataUrl?.trim()
        if (avatar.isNullOrEmpty()) {
            player.avatarUrl = null
        } else {
            if (avatar.startsWith("data:image/")) {
                if (avatar.length > 500_000) {
                    throw ApiException(HttpStatus.BAD_REQUEST, "Avatar is too large")
                }
            } else if (!(avatar.startsWith("http://") || avatar.startsWith("https://"))) {
                throw ApiException(HttpStatus.BAD_REQUEST, "Invalid avatar format")
            }
            player.avatarUrl = avatar
        }
        players.save(player)
        return me(principal)
    }

    @Transactional
    fun updateProfile(principal: JwtPrincipal, req: UpdateProfileRequest): MeResponse {
        val user = users.findById(principal.userId).orElseThrow { ApiException(HttpStatus.UNAUTHORIZED, "User not found") }
        if (user.disabled) throw ApiException(HttpStatus.FORBIDDEN, "Account disabled")
        val player = players.findById(user.playerId!!).orElseThrow { ApiException(HttpStatus.UNAUTHORIZED, "Player not found") }

        req.name?.trim()?.takeIf { it.isNotBlank() }?.let { name ->
            val existing = players.findByNameIgnoreCase(name)
            if (existing != null && existing.id != player.id) {
                throw ApiException(HttpStatus.CONFLICT, "Имя уже занято")
            }
            player.name = name
        }

        var emailChanged = false
        req.email?.trim()?.lowercase()?.takeIf { it.isNotBlank() }?.let { email ->
            if (disposableEmailChecker.isDisposable(email)) {
                throw ApiException(HttpStatus.BAD_REQUEST, "Используйте, пожалуйста, постоянный email-адрес")
            }
            val existing = users.findByEmailIgnoreCase(email)
            if (existing != null && existing.id != user.id) {
                throw ApiException(HttpStatus.CONFLICT, "Email уже занят")
            }
            if (user.email == null || !user.email!!.equals(email, ignoreCase = true)) {
                user.email = email
                // При смене email (или первой установке) сбрасываем подтверждение —
                // новый адрес тоже надо подтвердить.
                user.emailVerifiedAt = null
                emailChanged = true
            }
        }

        // Смена пароля через /profile больше не поддерживается — используйте POST /api/me/auth/password
        // (там требуется текущий пароль если он уже был задан). Поле req.password игнорируется.

        when {
            req.gender == null -> { /* no change */ }
            req.gender.trim().isEmpty() -> user.gender = null
            req.gender.trim().uppercase() in listOf("M", "F") -> user.gender = req.gender.trim().uppercase()
            else -> { /* invalid, no change */ }
        }

        req.showWinProbability?.let { user.showWinProbability = it }

        players.save(player)
        users.save(user)
        if (emailChanged) {
            emailVerification.sendVerificationEmail(user, player.name, EmailVerificationPurpose.EMAIL_CHANGE)
        }
        return me(principal)
    }

    private fun generatePublicId(): Long {
        repeat(10) {
            val candidate = 100_000_000L + (rng.nextDouble() * 900_000_000L).toLong()
            if (users.findByPublicId(candidate) == null) return candidate
        }
        throw ApiException(HttpStatus.CONFLICT, "Failed to generate public id")
    }

    private fun formatPublicId(publicId: Long): String = "#$publicId"
}

