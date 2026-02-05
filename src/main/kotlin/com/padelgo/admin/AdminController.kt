package com.padelgo.admin

import com.padelgo.api.ApiException
import com.padelgo.auth.JwtPrincipal
import com.padelgo.auth.JwtService
import com.padelgo.auth.UserRepository
import com.padelgo.domain.Player
import com.padelgo.repo.PlayerRepository
import jakarta.validation.constraints.NotBlank
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/admin")
class AdminController(
    private val users: UserRepository,
    private val players: PlayerRepository,
    private val encoder: PasswordEncoder,
    private val jwt: JwtService,
    @Value("\${app.admin.username}") private val adminUsername: String,
    @Value("\${app.admin.password}") private val adminPassword: String
) {
    @PostMapping("/login")
    fun login(@RequestBody req: AdminLoginRequest): AdminLoginResponse {
        val usernameOk = req.username.trim() == adminUsername.trim()
        val passwordOk = verifyPassword(req.password, adminPassword)
        if (!usernameOk || !passwordOk) throw ApiException(HttpStatus.UNAUTHORIZED, "Invalid credentials")
        return AdminLoginResponse(jwt.createAdminToken(adminUsername))
    }

    @GetMapping("/users")
    fun listUsers(): List<AdminUserResponse> {
        requireAdmin()
        val allUsers = users.findAll()
        val playerIds = allUsers.mapNotNull { it.playerId }.toSet()
        val playerById = players.findAllById(playerIds).associateBy { it.id!! }
        return allUsers.sortedBy { it.email.lowercase() }.map { u ->
            val player = playerById[u.playerId]
            AdminUserResponse.from(u.id!!, u.email, u.publicId, u.disabled, u.surveyCompleted, player)
        }
    }

    @PatchMapping("/users/{userId}")
    fun updateUser(@PathVariable userId: UUID, @RequestBody req: AdminUpdateUserRequest): AdminUserResponse {
        requireAdmin()
        val user = users.findById(userId).orElseThrow { ApiException(HttpStatus.NOT_FOUND, "User not found") }
        val player = user.playerId?.let { players.findById(it).orElse(null) }
        req.email?.trim()?.lowercase()?.let { nextEmail ->
            val existing = users.findByEmailIgnoreCase(nextEmail)
            if (existing != null && existing.id != user.id) throw ApiException(HttpStatus.CONFLICT, "Email already registered")
            user.email = nextEmail
        }
        req.name?.trim()?.takeIf { it.isNotBlank() }?.let { nextName ->
            if (player != null) {
                player.name = nextName
                players.save(player)
            }
        }
        req.password?.takeIf { it.isNotBlank() }?.let { nextPassword ->
            user.passwordHash = encoder.encode(nextPassword)
        }
        req.disabled?.let { user.disabled = it }
        users.save(user)
        return AdminUserResponse.from(user.id!!, user.email, user.publicId, user.disabled, user.surveyCompleted, player)
    }

    @DeleteMapping("/users/{userId}")
    fun deleteUser(@PathVariable userId: UUID): AdminUserResponse {
        requireAdmin()
        val user = users.findById(userId).orElseThrow { ApiException(HttpStatus.NOT_FOUND, "User not found") }
        val player = user.playerId?.let { players.findById(it).orElse(null) }
        user.disabled = true
        user.email = "deleted-$userId@deleted.local"
        user.passwordHash = encoder.encode(UUID.randomUUID().toString())
        if (player != null) {
            player.name = "Удалённый пользователь"
            players.save(player)
        }
        users.save(user)
        return AdminUserResponse.from(user.id!!, user.email, user.publicId, user.disabled, user.surveyCompleted, player)
    }

    private fun requireAdmin() {
        val principal = SecurityContextHolder.getContext().authentication?.principal
        if (principal is JwtPrincipal && principal.isAdmin) return
        throw ApiException(HttpStatus.FORBIDDEN, "Admin access required")
    }

    private fun verifyPassword(raw: String, configured: String): Boolean {
        val trimmed = configured.trim()
        return if (trimmed.startsWith("\$2a\$") || trimmed.startsWith("\$2b\$")) {
            encoder.matches(raw, trimmed)
        } else {
            raw == trimmed
        }
    }
}

data class AdminLoginRequest(
    @field:NotBlank
    val username: String,
    @field:NotBlank
    val password: String
)

data class AdminLoginResponse(
    val token: String
)

data class AdminUpdateUserRequest(
    val email: String? = null,
    val name: String? = null,
    val password: String? = null,
    val disabled: Boolean? = null
)

data class AdminUserResponse(
    val userId: UUID,
    val email: String,
    val publicId: String,
    val name: String,
    val rating: Int,
    val ntrp: String,
    val gamesPlayed: Int,
    val surveyCompleted: Boolean,
    val disabled: Boolean
) {
    companion object {
        fun from(
            userId: UUID,
            email: String,
            publicId: Long,
            disabled: Boolean,
            surveyCompleted: Boolean,
            player: Player?
        ): AdminUserResponse {
            val name = player?.name ?: email
            return AdminUserResponse(
                userId = userId,
                email = email,
                publicId = "#$publicId",
                name = name,
                rating = player?.rating ?: 0,
                ntrp = player?.ntrp ?: "1.0",
                gamesPlayed = player?.gamesPlayed ?: 0,
                surveyCompleted = surveyCompleted,
                disabled = disabled
            )
        }
    }
}
