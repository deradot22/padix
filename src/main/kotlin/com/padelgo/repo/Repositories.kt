package com.padelgo.repo

import com.padelgo.domain.Event
import com.padelgo.domain.Match
import com.padelgo.domain.MatchSetScore
import com.padelgo.domain.Player
import com.padelgo.domain.RatingChange
import com.padelgo.domain.Registration
import com.padelgo.domain.RegistrationStatus
import com.padelgo.domain.Round
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import java.time.LocalDate
import java.util.UUID

interface PlayerRepository : JpaRepository<Player, UUID> {
    fun findByNameIgnoreCase(name: String): Player?
}

interface EventRepository : JpaRepository<Event, UUID> {
    fun findAllByDateOrderByStartTimeAsc(date: LocalDate): List<Event>
    fun findAllByDateBetweenOrderByDateAscStartTimeAsc(from: LocalDate, to: LocalDate): List<Event>
}

interface RegistrationRepository : JpaRepository<Registration, UUID> {
    fun findAllByEventIdAndStatus(eventId: UUID, status: RegistrationStatus = RegistrationStatus.REGISTERED): List<Registration>

    fun findByEventIdAndPlayerId(eventId: UUID, playerId: UUID): Registration?

    fun findAllByEventIdAndCancelRequestedTrueAndStatus(
        eventId: UUID,
        status: RegistrationStatus = RegistrationStatus.REGISTERED
    ): List<Registration>

    fun deleteAllByEventId(eventId: UUID)

    fun countByEventIdAndStatus(eventId: UUID, status: RegistrationStatus = RegistrationStatus.REGISTERED): Long
}

interface RoundRepository : JpaRepository<Round, UUID> {
    fun findAllByEventIdOrderByRoundNumberAsc(eventId: UUID): List<Round>
}

interface MatchRepository : JpaRepository<Match, UUID> {
    fun findAllByRoundIdOrderByCourtNumberAsc(roundId: UUID): List<Match>

    @Query(
        """
        select m from Match m
        join Round r on r.id = m.roundId
        where r.eventId = :eventId
        """
    )
    fun findAllByEventId(@Param("eventId") eventId: UUID): List<Match>
}

interface MatchSetScoreRepository : JpaRepository<MatchSetScore, UUID> {
    fun findAllByMatchIdOrderBySetNumberAsc(matchId: UUID): List<MatchSetScore>
    fun deleteAllByMatchId(matchId: UUID)
}

interface RatingChangeRepository : JpaRepository<RatingChange, UUID> {
    fun deleteAllByEventId(eventId: UUID)
    fun findAllByPlayerId(playerId: UUID): List<RatingChange>
    fun findAllByPlayerIdAndEventId(playerId: UUID, eventId: UUID): List<RatingChange>
}

