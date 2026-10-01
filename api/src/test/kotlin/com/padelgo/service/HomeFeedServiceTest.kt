package com.padelgo.service

import com.padelgo.auth.UserAccount
import com.padelgo.auth.UserRepository
import com.padelgo.domain.Event
import com.padelgo.domain.EventStatus
import com.padelgo.domain.EventVisibility
import com.padelgo.domain.Friendship
import com.padelgo.domain.Player
import com.padelgo.domain.Registration
import com.padelgo.domain.RegistrationStatus
import com.padelgo.repo.EventRepository
import com.padelgo.repo.FriendshipRepository
import com.padelgo.repo.PlayerRepository
import com.padelgo.repo.RegistrationRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import java.time.LocalDate
import java.time.LocalTime
import java.util.Optional
import java.util.UUID

/**
 * Юнит-тесты на [HomeFeedService]: главная показывает только «круг» пользователя —
 * его самого и друзей, без чужих игр и игроков.
 */
class HomeFeedServiceTest {

    private val from = LocalDate.of(2026, 10, 1)
    private val to = from.plusDays(14)

    private val me = UUID.randomUUID()
    private val myPlayer = UUID.randomUUID()
    private val friend = UUID.randomUUID()
    private val friendPlayer = UUID.randomUUID()
    private val stranger = UUID.randomUUID()
    private val strangerPlayer = UUID.randomUUID()

    private val users = mock<UserRepository>()
    private val friends = mock<FriendshipRepository>()
    private val events = mock<EventRepository>()
    private val registrations = mock<RegistrationRepository>()
    private val players = mock<PlayerRepository>()
    private val service = HomeFeedService(users, friends, events, registrations, players)

    private val allEvents = mutableListOf<Event>()
    private val allRegs = mutableListOf<Registration>()

    init {
        whenever(friends.findAllByUserId(me)).thenReturn(listOf(Friendship(userId = me, friendUserId = friend)))
        val accounts = listOf(account(me, myPlayer), account(friend, friendPlayer), account(stranger, strangerPlayer))
        whenever(users.findAllById(any<Iterable<UUID>>())).thenAnswer { inv ->
            val ids = (inv.arguments[0] as Iterable<*>).toSet()
            accounts.filter { it.id in ids }
        }
        whenever(users.findById(me)).thenReturn(Optional.of(accounts[0]))

        // Репозиторий имитируем честно: фильтр по датам, статусам и авторам/участникам.
        whenever(events.findAllByCreatedByUserIdInAndDateBetweenAndStatusIn(any(), any(), any(), any())).thenAnswer { inv ->
            val authors = (inv.arguments[0] as Collection<*>).toSet()
            val statuses = (inv.arguments[3] as Collection<*>).toSet()
            allEvents.filter { it.createdByUserId in authors && it.status in statuses && it.date in from..to }
        }
        whenever(events.findAllWithRegisteredPlayers(any(), any(), any(), any())).thenAnswer { inv ->
            val playerIds = (inv.arguments[0] as Collection<*>).toSet()
            val statuses = (inv.arguments[3] as Collection<*>).toSet()
            val eventIds = allRegs.filter { it.playerId in playerIds && it.status == RegistrationStatus.REGISTERED }
                .map { it.eventId }.toSet()
            allEvents.filter { it.id in eventIds && it.status in statuses && it.date in from..to }
        }
        whenever(registrations.findAllByEventIdInAndStatus(any(), anyOrNull())).thenAnswer { inv ->
            val ids = (inv.arguments[0] as Collection<*>).toSet()
            allRegs.filter { it.eventId in ids && it.status == RegistrationStatus.REGISTERED }
        }
    }

    private fun account(userId: UUID, playerId: UUID) = UserAccount(id = userId, playerId = playerId)

    private fun event(
        title: String,
        author: UUID,
        day: Long = 1,
        status: EventStatus = EventStatus.OPEN_FOR_REGISTRATION,
        visibility: EventVisibility = EventVisibility.PUBLIC,
        registered: List<UUID> = emptyList()
    ): Event {
        val e = Event(
            id = UUID.randomUUID(),
            title = title,
            date = from.plusDays(day),
            startTime = LocalTime.of(19, 0),
            status = status,
            createdByUserId = author,
            visibility = visibility
        )
        allEvents += e
        registered.forEach { allRegs += Registration(id = UUID.randomUUID(), eventId = e.id, playerId = it) }
        return e
    }

    private fun feedTitles() = service.upcomingGames(me, from, to).map { it.title }

    @Test
    fun `в ленте мои игры и игры друзей, чужих нет`() {
        event("моя", author = me)
        event("друг создал", author = friend)
        event("друг записался к чужому", author = stranger, registered = listOf(friendPlayer))
        event("я записался к чужому", author = stranger, registered = listOf(myPlayer))
        event("чужая", author = stranger, registered = listOf(strangerPlayer))

        assertEquals(
            setOf("моя", "друг создал", "друг записался к чужому", "я записался к чужому"),
            feedTitles().toSet()
        )
    }

    @Test
    fun `отменённые, черновики и сыгранные не показываются`() {
        event("открыта", author = friend)
        event("идёт", author = friend, status = EventStatus.IN_PROGRESS)
        event("отменена", author = friend, status = EventStatus.CANCELLED)
        event("черновик", author = friend, status = EventStatus.DRAFT)
        event("сыграна", author = friend, status = EventStatus.FINISHED)

        assertEquals(setOf("открыта", "идёт"), feedTitles().toSet())
    }

    @Test
    fun `приватная игра друга видна, только если я в ней участвую`() {
        event("приватная друга без меня", author = friend, visibility = EventVisibility.PRIVATE)
        event("приватная друга со мной", author = friend, visibility = EventVisibility.PRIVATE, registered = listOf(myPlayer))
        event("моя приватная", author = me, visibility = EventVisibility.PRIVATE)

        assertEquals(setOf("приватная друга со мной", "моя приватная"), feedTitles().toSet())
    }

    @Test
    fun `игра, где и я, и друг, приходит один раз, лента отсортирована по дате`() {
        event("позже", author = friend, day = 5, registered = listOf(myPlayer, friendPlayer))
        event("раньше", author = me, day = 2)

        assertEquals(listOf("раньше", "позже"), feedTitles())
    }

    @Test
    fun `«вы записаны» — только игры, где есть моя регистрация`() {
        val withMe = event("со мной", author = friend, registered = listOf(myPlayer, friendPlayer))
        val withoutMe = event("без меня", author = friend, registered = listOf(friendPlayer))
        val mineEmpty = event("моя пустая", author = me)

        val registered = service.registeredEventIds(myPlayer, listOf(withMe.id!!, withoutMe.id!!, mineEmpty.id!!))

        assertEquals(setOf(withMe.id), registered)
        assertEquals(emptySet<UUID>(), service.registeredEventIds(myPlayer, emptyList()))
    }

    @Test
    fun `без друзей лента состоит только из моих игр`() {
        whenever(friends.findAllByUserId(me)).thenReturn(emptyList())
        event("моя", author = me)
        event("друг создал", author = friend)

        assertEquals(listOf("моя"), feedTitles())
    }

    @Test
    fun `топ — я и друзья по рейтингу, чужих и гостей нет`() {
        val mine = Player(id = myPlayer, name = "Я", rating = 1100)
        val friends = Player(id = friendPlayer, name = "Друг", rating = 1300)
        whenever(players.findAllById(any<Iterable<UUID>>())).thenAnswer { inv ->
            val ids = (inv.arguments[0] as Iterable<*>).toSet()
            listOf(mine, friends, Player(id = strangerPlayer, name = "Чужой", rating = 1900)).filter { it.id in ids }
        }

        val top = service.topPlayers(me)

        assertEquals(listOf("Друг", "Я"), top.map { it.name })
        assertTrue(top.none { it.name == "Чужой" })
    }
}
