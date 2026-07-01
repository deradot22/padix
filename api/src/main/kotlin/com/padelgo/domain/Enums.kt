package com.padelgo.domain

enum class EventFormat {
    /** Американка — партнёры ротируются каждый раунд, анти-повтор (планировщик PairingPlanner). */
    AMERICANA,
    /** Mexicano — пары каждый раунд формируются по текущей таблице очков (1+4 vs 2+3); раунды инкрементальные. */
    MEXICANO,
    /** Фиксированные пары — партнёр не меняется весь матч; round-robin между парами (team_id на регистрации). */
    FIXED_PAIRS
}

enum class PairingMode {
    ROUND_ROBIN,
    BALANCED
}

enum class ScoringMode {
    SETS,
    POINTS
}

enum class EventStatus {
    DRAFT,
    OPEN_FOR_REGISTRATION,
    REGISTRATION_CLOSED,
    IN_PROGRESS,
    FINISHED,
    CANCELLED
}

enum class RegistrationStatus {
    REGISTERED,
    CANCELLED
}

enum class MatchStatus {
    SCHEDULED,
    FINISHED
}

enum class FriendRequestStatus {
    PENDING,
    ACCEPTED,
    DECLINED
}

enum class InviteStatus {
    PENDING,
    ACCEPTED,
    DECLINED
}

enum class EventVisibility {
    PRIVATE,
    PUBLIC
}