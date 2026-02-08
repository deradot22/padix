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
    private val jwt: JwtService
) {
    private val rng = SecureRandom()

    @Transactional
    fun register(req: RegisterRequest): AuthResponse {
        val email = req.email.trim().lowercase()
        if (users.findByEmailIgnoreCase(email) != null) throw ApiException(HttpStatus.CONFLICT, "Email already registered")

        val player = players.save(
            com.padelgo.domain.Player(
                name = req.name.trim(),
                rating = 1000,
                ntrp = Ntrp.fromRating(1000),
                gamesPlayed = 0
            )
        )
        val user = users.save(
            UserAccount(
                email = email,
                passwordHash = encoder.encode(req.password),
                playerId = player.id!!,
                publicId = generatePublicId()
            )
        )
        return AuthResponse(jwt.createToken(user.id!!, user.email, user.playerId!!, false))
    }

    fun login(req: LoginRequest): AuthResponse {
        val email = req.email.trim().lowercase()
        val user = users.findByEmailIgnoreCase(email) ?: throw ApiException(HttpStatus.UNAUTHORIZED, "Invalid credentials")
        if (user.disabled) throw ApiException(HttpStatus.FORBIDDEN, "Account disabled")
        if (!encoder.matches(req.password, user.passwordHash)) throw ApiException(HttpStatus.UNAUTHORIZED, "Invalid credentials")
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
            avatarUrl = player.avatarUrl
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
            if (avatar.length > 500_000) {
                throw ApiException(HttpStatus.BAD_REQUEST, "Avatar is too large")
            }
            if (!avatar.startsWith("data:image/")) {
                throw ApiException(HttpStatus.BAD_REQUEST, "Invalid avatar format")
            }
            player.avatarUrl = avatar
        }
        players.save(player)
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

