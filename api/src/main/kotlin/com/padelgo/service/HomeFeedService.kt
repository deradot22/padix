package com.padelgo.service

import com.padelgo.auth.UserRepository
import com.padelgo.domain.Event
import com.padelgo.domain.EventStatus
import com.padelgo.domain.EventVisibility
import com.padelgo.domain.Player
import com.padelgo.domain.RegistrationStatus
import com.padelgo.repo.EventRepository
import com.padelgo.repo.FriendshipRepository
import com.padelgo.repo.PlayerRepository
import com.padelgo.repo.RegistrationRepository
import org.springframework.stereotype.Service
import java.time.LocalDate
import java.util.UUID

/**
 * Персональные блоки главной: «ближайшие игры» и «топ игроков».
 *
 * Глобальные ленты (/api/events/upcoming, /api/players/rating) на главной не годятся:
 * там игры и игроки всех подряд, в том числе из других городов и стран. Поэтому главная
 * показывает только «круг» пользователя — его самого и принятых друзей.
 *
 * Круг — единственное место, которое надо расширить, когда появятся клубы: добавить игры
 * и игроков избранных клубов / своего города. Клиенты при этом не меняются.
 */
@Service
class HomeFeedService(
    private val users: UserRepository,
    private val friends: FriendshipRepository,
    private val events: EventRepository,
    private val registrations: RegistrationRepository,
    private val players: PlayerRepository
) {
    /** Статусы, которые имеет смысл показывать как «предстоящие»: без черновиков, отменённых и сыгранных. */
    private val activeStatuses = listOf(
        EventStatus.OPEN_FOR_REGISTRATION,
        EventStatus.REGISTRATION_CLOSED,
        EventStatus.IN_PROGRESS
    )

    private data class Circle(val userId: UUID, val myPlayerId: UUID?, val userIds: Set<UUID>, val playerIds: Set<UUID>)

    private fun circleOf(userId: UUID): Circle {
        val friendUserIds = friends.findAllByUserId(userId).mapNotNull { it.friendUserId }.toSet()
        val userIds = friendUserIds + userId
        val playerIds = users.findAllById(userIds).mapNotNull { it.playerId }.toSet()
        val myPlayerId = users.findById(userId).orElse(null)?.playerId
        return Circle(userId, myPlayerId, userIds, playerIds)
    }

    /**
     * Игры, которые создал или куда записался сам пользователь либо его друг.
     * Чужие приватные игры отсекаются: в них можно попасть только по приглашению,
     * а детали всё равно закрыты — в ленте они были бы тупиком.
     */
    fun upcomingGames(userId: UUID, from: LocalDate, to: LocalDate): List<Event> {
        val circle = circleOf(userId)
        val authored = events.findAllByCreatedByUserIdInAndDateBetweenAndStatusIn(circle.userIds, from, to, activeStatuses)
        val joined = if (circle.playerIds.isEmpty()) emptyList()
        else events.findAllWithRegisteredPlayers(circle.playerIds, from, to, activeStatuses)

        val candidates = (authored + joined).distinctBy { it.id }
        if (candidates.isEmpty()) return emptyList()

        val myEventIds = circle.myPlayerId?.let { me ->
            registrations.findAllByEventIdInAndStatus(candidates.mapNotNull { it.id }, RegistrationStatus.REGISTERED)
                .filter { it.playerId == me }
                .mapNotNull { it.eventId }
                .toSet()
        }.orEmpty()

        return candidates
            .filter { e -> e.visibility == EventVisibility.PUBLIC || e.createdByUserId == userId || e.id in myEventIds }
            .sortedWith(compareBy<Event> { it.date }.thenBy { it.startTime })
    }

    /**
     * Из каких игр списка игрок записан — для бейджа «Вы записаны» в карточках. Один запрос
     * на весь список вместо деталей каждой игры, как раньше делал сайт.
     */
    fun registeredEventIds(playerId: UUID, eventIds: Collection<UUID>): Set<UUID> {
        if (eventIds.isEmpty()) return emptySet()
        return registrations.findAllByEventIdInAndStatus(eventIds)
            .filter { it.playerId == playerId }
            .mapTo(HashSet()) { it.eventId!! }
    }

    /** Сам пользователь и его друзья, по рейтингу — тот же порядок, что и в общем рейтинге. */
    fun topPlayers(userId: UUID): List<Player> {
        val circle = circleOf(userId)
        if (circle.playerIds.isEmpty()) return emptyList()
        return players.findAllById(circle.playerIds)
            .filter { !it.isGuest }
            .sortedWith(compareByDescending<Player> { it.rating }.thenBy { it.name.lowercase() })
    }
}
