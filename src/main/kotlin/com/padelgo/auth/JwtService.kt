package com.padelgo.auth

import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.time.Instant
import java.util.Date
import java.util.UUID

@Service
class JwtService(
    @Value("\${app.jwt.secret}") secret: String,
    @Value("\${app.jwt.ttlSeconds}") private val ttlSeconds: Long
) {
    private val key = Keys.hmacShaKeyFor(secret.toByteArray(Charsets.UTF_8))

    fun createToken(userId: UUID, email: String, playerId: UUID): String {
        val now = Instant.now()
        val exp = now.plusSeconds(ttlSeconds)
        return Jwts.builder()
            .subject(userId.toString())
            .claim("email", email)
            .claim("playerId", playerId.toString())
            .issuedAt(Date.from(now))
            .expiration(Date.from(exp))
            .signWith(key)
            .compact()
    }

    fun parse(token: String): JwtPrincipal {
        val claims = Jwts.parser().verifyWith(key).build()
            .parseSignedClaims(token)
            .payload
        val userId = UUID.fromString(claims.subject)
        val email = claims["email"] as String
        val playerId = UUID.fromString(claims["playerId"] as String)
        return JwtPrincipal(userId = userId, email = email, playerId = playerId)
    }
}

data class JwtPrincipal(
    val userId: UUID,
    val email: String,
    val playerId: UUID
)

