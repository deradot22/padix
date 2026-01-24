package com.padelgo.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UuidGenerator
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

@Entity
@Table(name = "players")
class Player(
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    @Column(name = "name", nullable = false, unique = true)
    var name: String = "",

    @Column(name = "rating", nullable = false)
    var rating: Int = 1000,

    @Column(name = "games_played", nullable = false)
    var gamesPlayed: Int = 0,

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant? = null
)

@Entity
@Table(name = "events")
class Event(
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    @Column(name = "title", nullable = false)
    var title: String = "",

    @Column(name = "event_date", nullable = false)
    var date: LocalDate = LocalDate.now(),

    @Column(name = "start_time", nullable = false)
    var startTime: LocalTime = LocalTime.of(19, 0),

    @Column(name = "end_time", nullable = false)
    var endTime: LocalTime = LocalTime.of(21, 0),

    @Enumerated(EnumType.STRING)
    @Column(name = "format", nullable = false)
    var format: EventFormat = EventFormat.AMERICANA,

    @Enumerated(EnumType.STRING)
    @Column(name = "pairing_mode", nullable = false)
    var pairingMode: PairingMode = PairingMode.ROUND_ROBIN,

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    var status: EventStatus = EventStatus.OPEN_FOR_REGISTRATION,

    @Column(name = "courts_count", nullable = false)
    var courtsCount: Int = 2,

    @Column(name = "rounds_planned", nullable = false)
    var roundsPlanned: Int = 6,

    // Match rules (customizable)
    @Column(name = "auto_rounds", nullable = false)
    var autoRounds: Boolean = true,

    @Column(name = "created_by_user_id")
    var createdByUserId: UUID? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "scoring_mode", nullable = false)
    var scoringMode: ScoringMode = ScoringMode.SETS,

    @Column(name = "points_per_player_per_match", nullable = false)
    var pointsPerPlayerPerMatch: Int = 6,

    @Column(name = "sets_per_match", nullable = false)
    var setsPerMatch: Int = 1,

    @Column(name = "games_per_set", nullable = false)
    var gamesPerSet: Int = 6,

    @Column(name = "tiebreak_enabled", nullable = false)
    var tiebreakEnabled: Boolean = true,

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant? = null
)

@Entity
@Table(name = "registrations")
class Registration(
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    @Column(name = "event_id", nullable = false)
    var eventId: UUID? = null,

    @Column(name = "player_id", nullable = false)
    var playerId: UUID? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    var status: RegistrationStatus = RegistrationStatus.REGISTERED,

    @Column(name = "cancel_requested", nullable = false)
    var cancelRequested: Boolean = false,

    @Column(name = "cancel_approved", nullable = false)
    var cancelApproved: Boolean = false,

    @Column(name = "cancel_requested_at")
    var cancelRequestedAt: Instant? = null,

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant? = null
)

@Entity
@Table(name = "rounds")
class Round(
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    @Column(name = "event_id", nullable = false)
    var eventId: UUID? = null,

    @Column(name = "round_number", nullable = false)
    var roundNumber: Int = 1
)

@Entity
@Table(name = "matches")
class Match(
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    @Column(name = "round_id", nullable = false)
    var roundId: UUID? = null,

    @Column(name = "court_number", nullable = false)
    var courtNumber: Int = 1,

    @Column(name = "team_a_p1", nullable = false)
    var teamAPlayer1Id: UUID? = null,

    @Column(name = "team_a_p2", nullable = false)
    var teamAPlayer2Id: UUID? = null,

    @Column(name = "team_b_p1", nullable = false)
    var teamBPlayer1Id: UUID? = null,

    @Column(name = "team_b_p2", nullable = false)
    var teamBPlayer2Id: UUID? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    var status: MatchStatus = MatchStatus.SCHEDULED
)

@Entity
@Table(name = "match_set_scores")
class MatchSetScore(
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    @Column(name = "match_id", nullable = false)
    var matchId: UUID? = null,

    @Column(name = "set_number", nullable = false)
    var setNumber: Int = 1,

    @Column(name = "team_a_games", nullable = false)
    var teamAGames: Int = 0,

    @Column(name = "team_b_games", nullable = false)
    var teamBGames: Int = 0
)

@Entity
@Table(name = "rating_changes")
class RatingChange(
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    @Column(name = "event_id", nullable = false)
    var eventId: UUID? = null,

    @Column(name = "match_id")
    var matchId: UUID? = null,

    @Column(name = "player_id", nullable = false)
    var playerId: UUID? = null,

    @Column(name = "old_rating", nullable = false)
    var oldRating: Int = 0,

    @Column(name = "delta", nullable = false)
    var delta: Int = 0,

    @Column(name = "new_rating", nullable = false)
    var newRating: Int = 0,

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant? = null
)

