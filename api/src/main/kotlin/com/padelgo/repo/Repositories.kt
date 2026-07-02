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
    fun findAllBySeriesId(seriesId: UUID): List<Event>
}

interface EventSeriesRepository : JpaRepository<com.padelgo.domain.EventSeries, UUID> {
    fun findAllByCreatedByUserIdOrderByCreatedAtDesc(userId: UUID): List<com.padelgo.domain.EventSeries>
    fun findAllByActiveTrue(): List<com.padelgo.domain.EventSeries>
}

interface RegistrationRepository : JpaRepository<Registration, UUID> {
    fun findAllByEventIdAndStatus(eventId: UUID, status: RegistrationStatus = RegistrationStatus.REGISTERED): List<Registration>

    fun findAllByEventIdInAndStatus(
        eventIds: Collection<UUID>,
        status: RegistrationStatus = RegistrationStatus.REGISTERED
    ): List<Registration>

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
        order by r.roundNumber asc, m.courtNumber asc
        """
    )
    fun findAllByEventId(@Param("eventId") eventId: UUID): List<Match>

    @Query(
        """
        select m from Match m
        where m.teamAPlayer1Id = :playerId
           or m.teamAPlayer2Id = :playerId
           or m.teamBPlayer1Id = :playerId
           or m.teamBPlayer2Id = :playerId
        """
    )
    fun findAllByPlayerParticipating(@Param("playerId") playerId: UUID): List<Match>
}

interface MatchSetScoreRepository : JpaRepository<MatchSetScore, UUID> {
    fun findAllByMatchIdOrderBySetNumberAsc(matchId: UUID): List<MatchSetScore>
    fun findAllByMatchIdInOrderBySetNumberAsc(matchIds: Collection<UUID>): List<MatchSetScore>
    fun deleteAllByMatchId(matchId: UUID)

    @org.springframework.data.jpa.repository.Modifying
    @Query(
        value = """
            insert into match_set_scores (match_id, set_number, team_a_games, team_b_games, submitted_by_user_id, id)
            values (:matchId, :setNumber, :teamAGames, :teamBGames, :submittedByUserId, gen_random_uuid())
            on conflict (match_id, set_number)
            do update set
                team_a_games = excluded.team_a_games,
                team_b_games = excluded.team_b_games,
                submitted_by_user_id = excluded.submitted_by_user_id
        """,
        nativeQuery = true
    )
    fun upsertScore(
        @Param("matchId") matchId: UUID,
        @Param("setNumber") setNumber: Int,
        @Param("teamAGames") teamAGames: Int,
        @Param("teamBGames") teamBGames: Int,
        @Param("submittedByUserId") submittedByUserId: UUID?
    )

    @org.springframework.data.jpa.repository.Modifying
    @Query(
        value = "delete from match_set_scores where match_id = :matchId and set_number not in (:keep)",
        nativeQuery = true
    )
    fun deleteAllByMatchIdAndSetNumberNotIn(
        @Param("matchId") matchId: UUID,
        @Param("keep") keep: List<Int>
    )
}

interface MatchDraftScoreRepository : JpaRepository<com.padelgo.domain.MatchDraftScore, UUID> {
    fun findByMatchId(matchId: UUID): com.padelgo.domain.MatchDraftScore?
    fun findAllByMatchIdIn(matchIds: Collection<UUID>): List<com.padelgo.domain.MatchDraftScore>
    fun deleteByMatchId(matchId: UUID)
}

interface RatingChangeRepository : JpaRepository<RatingChange, UUID> {
    fun deleteAllByEventId(eventId: UUID)
    fun deleteAllByMatchId(matchId: UUID)
    fun findAllByPlayerIdOrderByCreatedAtAsc(playerId: UUID): List<RatingChange>
    fun findAllByPlayerId(playerId: UUID): List<RatingChange>
    fun findAllByPlayerIdAndEventId(playerId: UUID, eventId: UUID): List<RatingChange>
    fun findAllByEventId(eventId: UUID): List<RatingChange>

    /**
     * Последняя МАТЧЕВАЯ запись игрока — база для идемпотентного decay (decay-записи
     * с matchId=null исключены, поэтому база стабильна между ежедневными прогонами).
     */
    fun findFirstByPlayerIdAndMatchIdIsNotNullOrderByCreatedAtDesc(playerId: UUID): RatingChange?

    /** Самая свежая запись игрока любого типа — чтобы найти «хвостовую» decay-запись. */
    fun findFirstByPlayerIdOrderByCreatedAtDesc(playerId: UUID): RatingChange?
}

interface UserRatingNotificationRepository : JpaRepository<com.padelgo.domain.UserRatingNotification, UUID> {
    fun findFirstByUserIdAndSeenAtIsNullOrderByCreatedAtDesc(userId: UUID): com.padelgo.domain.UserRatingNotification?
    fun findAllByUserIdOrderByCreatedAtDesc(userId: UUID, pageable: org.springframework.data.domain.Pageable): List<com.padelgo.domain.UserRatingNotification>
    /** Нотификации по конкретному эвенту (для идемпотентного пересоздания после пересчёта). */
    fun findAllByEventId(eventId: UUID): List<com.padelgo.domain.UserRatingNotification>
    fun findByUserIdAndEventId(userId: UUID, eventId: UUID): com.padelgo.domain.UserRatingNotification?
}

