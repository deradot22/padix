package com.padelgo.auth

import com.padelgo.domain.Countries
import com.padelgo.domain.Player
import com.padelgo.repo.PlayerRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import java.util.Optional
import java.util.UUID

/** Страна в профиле: только коды ISO, пустая строка убирает, мусор не меняет сохранённое. */
class AuthServiceCountryTest {
    private val users = mock<UserRepository>()
    private val players = mock<PlayerRepository>()
    private val service =
        AuthService(
            users = users,
            players = players,
            encoder = mock(),
            jwt = mock(),
            emailVerification = mock(),
            disposableEmailChecker = mock(),
        )

    private val player = Player(id = UUID.randomUUID(), name = "Ana", country = "ES")
    private val user = UserAccount(id = UUID.randomUUID(), playerId = player.id)
    private val principal = JwtPrincipal(userId = user.id!!, email = "ana@padix.test", playerId = player.id!!)

    init {
        whenever(users.findById(user.id!!)).thenReturn(Optional.of(user))
        whenever(players.findById(player.id!!)).thenReturn(Optional.of(player))
        whenever(users.save(any<UserAccount>())).doAnswer { it.arguments[0] as UserAccount }
        whenever(players.save(any<Player>())).doAnswer { it.arguments[0] as Player }
    }

    @Test
    fun `country code is normalized to upper case`() {
        val me = service.updateProfile(principal, UpdateProfileRequest(country = " pt "))

        assertEquals("PT", player.country)
        assertEquals("PT", me.country)
    }

    @Test
    fun `empty string clears the country`() {
        service.updateProfile(principal, UpdateProfileRequest(country = ""))

        assertNull(player.country)
    }

    @Test
    fun `unknown code leaves the saved country untouched`() {
        service.updateProfile(principal, UpdateProfileRequest(country = "ZZ"))

        assertEquals("ES", player.country)
    }

    @Test
    fun `absent field leaves the saved country untouched`() {
        service.updateProfile(principal, UpdateProfileRequest(name = "Ana"))

        assertEquals("ES", player.country)
    }

    @Test
    fun `only ISO alpha-2 codes are accepted`() {
        assertEquals("DE", Countries.normalize("de"))
        assertNull(Countries.normalize("Germany"))
        assertNull(Countries.normalize(null))
    }
}
