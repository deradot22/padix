package com.padelgo.auth

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.annotations.UuidGenerator
import org.hibernate.type.SqlTypes
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "users")
class UserAccount(
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    @Column(name = "email", nullable = false, unique = true)
    var email: String = "",

    @Column(name = "password_hash", nullable = false)
    var passwordHash: String = "",

    @Column(name = "player_id", nullable = false, unique = true)
    var playerId: UUID? = null,

    @Column(name = "public_id", nullable = false, unique = true)
    var publicId: Long = 0,

    @Column(name = "survey_completed", nullable = false)
    var surveyCompleted: Boolean = false,

    @Column(name = "survey_level")
    var surveyLevel: Double? = null,

    @Column(name = "survey_version", nullable = false)
    var surveyVersion: Int = 1,

    @Column(name = "survey_payload", columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    var surveyPayload: String? = null,

    @Column(name = "calibration_events_remaining", nullable = false)
    var calibrationEventsRemaining: Int = 0,

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant? = null
)

