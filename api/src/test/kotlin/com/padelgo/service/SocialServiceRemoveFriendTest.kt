package com.padelgo.service

import com.padelgo.api.ApiException
import com.padelgo.auth.UserAccount
import com.padelgo.auth.UserRepository
import com.padelgo.repo.EventInviteRepository
import com.padelgo.repo.EventRepository
import com.padelgo.repo.FriendRequestRepository
import com.padelgo.repo.FriendshipRepository
import com.padelgo.repo.PlayerRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import org.springframework.http.HttpStatus
import java.util.UUID

/**
 * Юнит-тесты на [SocialService.removeFriend]: удаление из друзей взаимное
 * и не мешает позже снова отправить заявку.
 */
class SocialServiceRemoveFriendTest {

    private val me = UUID.randomUUID()
    private val friend = UUID.randomUUID()
    private val friendPublicId = 867643557L

    private val users = mock<UserRepository>()
    private val friendRequests = mock<FriendRequestRepository>()
    private val friends = mock<FriendshipRepository>()
    private val service = SocialService(
        users,
        mock<PlayerRepository>(),
        mock<EventRepository>(),
        friendRequests,
        friends,
        mock<EventInviteRepository>(),
        mock<EventService>()
    )

    init {
        val account = mock<UserAccount>()
        whenever(account.id).thenReturn(friend)
        whenever(users.findByPublicId(friendPublicId)).thenReturn(account)
    }

    @Test
    fun `удаление убирает связь в обе стороны и заявки между парой`() {
        whenever(friends.deleteByUserIdAndFriendUserId(me, friend)).thenReturn(1)
        whenever(friends.deleteByUserIdAndFriendUserId(friend, me)).thenReturn(1)

        service.removeFriend(me, "#$friendPublicId")

        verify(friends).deleteByUserIdAndFriendUserId(me, friend)
        verify(friends).deleteByUserIdAndFriendUserId(friend, me)
        verify(friendRequests).deleteByFromUserIdAndToUserId(me, friend)
        verify(friendRequests).deleteByFromUserIdAndToUserId(friend, me)
    }

    @Test
    fun `если не друзья — 404 и заявки не трогаются`() {
        whenever(friends.deleteByUserIdAndFriendUserId(any(), any())).thenReturn(0)

        val ex = assertThrows<ApiException> { service.removeFriend(me, "#$friendPublicId") }

        assertEquals(HttpStatus.NOT_FOUND, ex.status)
        verify(friendRequests, never()).deleteByFromUserIdAndToUserId(any(), any())
    }

    @Test
    fun `неизвестный ID — 404`() {
        val ex = assertThrows<ApiException> { service.removeFriend(me, "#111") }
        assertEquals(HttpStatus.NOT_FOUND, ex.status)
    }
}
