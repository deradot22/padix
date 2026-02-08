package com.padelgo.api

import com.padelgo.domain.Event
import com.padelgo.domain.EventFormat
import com.padelgo.domain.EventStatus
import com.padelgo.domain.PairingMode
import com.padelgo.domain.Match
import com.padelgo.domain.Player
import com.padelgo.domain.Round
import com.padelgo.domain.ScoringMode
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

data class CreatePlayerRequest(
    @field:NotBlank
    val name: String
)

data class PlayerResponse(
    val id: UUID,
    val name: String,
    val rating: Int,
    val ntrp: String,
    val gamesPlayed: Int,
    val calibrationEventsRemaining: Int? = null,
    val publicId: String? = null,
    val avatarUrl: String? = null
) {
    companion object {
        fun from(p: Player, calibrationEventsRemaining: Int? = null, publicId: String? = null) = PlayerResponse(
            id = p.id!!,
            name = p.name,
            rating = p.rating,
            ntrp = p.ntrp,
            gamesPlayed = p.gamesPlayed,
            calibrationEventsRemaining = calibrationEventsRemaining,
            publicId = publicId,
            avatarUrl = p.avatarUrl
        )
    }
}

data class CreateEventRequest(
    @field:NotBlank
    val title: String,
    @field:NotNull
    val date: LocalDate,
    @field:NotNull
    val startTime: LocalTime,
    @field:NotNull
    val endTime: LocalTime,
    val format: EventFormat = EventFormat.AMERICANA,
    val pairingMode: PairingMode = PairingMode.ROUND_ROBIN,
    @field:Min(1)
    val courtsCount: Int = 2,
    val courtNames: List<String>? = null,
    val autoRounds: Boolean = true,
    @field:Min(1)
    val roundsPlanned: Int = 6,

    // Match rules (customizable)
    val scoringMode: ScoringMode = ScoringMode.SETS,
    @field:Min(1)
    val pointsPerPlayerPerMatch: Int = 6,
    @field:Min(1)
    val setsPerMatch: Int = 1,
    @field:Min(1)
    val gamesPerSet: Int = 6,
    val tiebreakEnabled: Boolean = true
)

data class UpdateEventRequest(
    @field:Min(1)
    val pointsPerPlayerPerMatch: Int? = null
)

data class EventResponse(
    val id: UUID,
    val title: String,
    val date: LocalDate,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val format: EventFormat,
    val pairingMode: PairingMode,
    val status: EventStatus,
    val registeredCount: Int,
    val courtsCount: Int,
    val roundsPlanned: Int,
    val autoRounds: Boolean,
    val scoringMode: ScoringMode,
    val pointsPerPlayerPerMatch: Int,
    val setsPerMatch: Int,
    val gamesPerSet: Int,
    val tiebreakEnabled: Boolean
) {
    companion object {
        fun from(e: Event, registeredCount: Int = 0) = EventResponse(
            id = e.id!!,
            title = e.title,
            date = e.date,
            startTime = e.startTime,
            endTime = e.endTime,
            format = e.format,
            pairingMode = e.pairingMode,
            status = e.status,
            registeredCount = registeredCount,
            courtsCount = e.courtsCount,
            roundsPlanned = e.roundsPlanned,
            autoRounds = e.autoRounds,
            scoringMode = e.scoringMode,
            pointsPerPlayerPerMatch = e.pointsPerPlayerPerMatch,
            setsPerMatch = e.setsPerMatch,
            gamesPerSet = e.gamesPerSet,
            tiebreakEnabled = e.tiebreakEnabled
        )
    }
}

data class RegisterRequest(
    @field:NotNull
    val playerId: UUID
)

data class SetScoreRequest(
    @field:Min(0)
    val teamAGames: Int,
    @field:Min(0)
    val teamBGames: Int
)

data class PointsScoreRequest(
    @field:Min(0)
    val teamAPoints: Int,
    @field:Min(0)
    val teamBPoints: Int
)

data class DraftScoreRequest(
    @field:Min(0)
    val teamAPoints: Int,
    @field:Min(0)
    val teamBPoints: Int
)

data class SubmitScoreRequest(
    val sets: List<SetScoreRequest>? = null,
    val points: PointsScoreRequest? = null
)

data class MatchResponse(
    val id: UUID,
    val courtNumber: Int,
    val courtName: String? = null,
    val teamA: List<PlayerResponse>,
    val teamB: List<PlayerResponse>,
    val status: String,
    val score: ScoreResponse?
) {
    companion object {
        fun from(m: Match, players: Map<UUID, PlayerResponse>, score: ScoreResponse?, courtName: String? = null) = MatchResponse(
            id = m.id!!,
            courtNumber = m.courtNumber,
            courtName = courtName,
            teamA = listOf(players[m.teamAPlayer1Id]!!, players[m.teamAPlayer2Id]!!),
            teamB = listOf(players[m.teamBPlayer1Id]!!, players[m.teamBPlayer2Id]!!),
            status = m.status.name,
            score = score
        )
    }
}

data class ScoreResponse(
    val mode: ScoringMode,
    val sets: List<SetScoreRequest>? = null,
    val points: PointsScoreRequest? = null
)

data class RoundResponse(
    val id: UUID,
    val roundNumber: Int,
    val matches: List<MatchResponse>
) {
    companion object {
        fun from(r: Round, matches: List<MatchResponse>) = RoundResponse(
            id = r.id!!,
            roundNumber = r.roundNumber,
            matches = matches
        )
    }
}

data class EventDetailsResponse(
    val event: EventResponse,
    val rounds: List<RoundResponse>,
    val registeredPlayers: List<PlayerResponse>,
    val pendingCancelRequests: List<PlayerResponse>,
    val isAuthor: Boolean,
    val authorName: String
)

data class CancelRegistrationResponse(
    val status: String,
    val message: String
)

