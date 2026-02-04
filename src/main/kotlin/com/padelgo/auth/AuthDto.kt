package com.padelgo.auth

import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank

data class RegisterRequest(
    @field:Email
    @field:NotBlank
    val email: String,

    @field:NotBlank
    val password: String,

    @field:NotBlank
    val name: String
)

data class LoginRequest(
    @field:Email
    @field:NotBlank
    val email: String,

    @field:NotBlank
    val password: String
)

data class AuthResponse(
    val token: String
)

data class MeResponse(
    val email: String,
    val playerId: java.util.UUID,
    val name: String,
    val rating: Int,
    val ntrp: String,
    val gamesPlayed: Int,
    val publicId: String,
    val surveyCompleted: Boolean,
    val surveyLevel: Double?,
    val calibrationEventsRemaining: Int
)

