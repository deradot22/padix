package com.padelgo.domain

enum class EventFormat {
    AMERICANA
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

