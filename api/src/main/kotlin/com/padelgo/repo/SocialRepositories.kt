package com.padelgo.repo

import com.padelgo.domain.EventInvite
import com.padelgo.domain.FriendRequest
import com.padelgo.domain.FriendRequestStatus
import com.padelgo.domain.Friendship
import com.padelgo.domain.InviteStatus
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface FriendRequestRepository : JpaRepository<FriendRequest, UUID> {
    fun findAllByToUserIdAndStatus(userId: UUID, status: FriendRequestStatus): List<FriendRequest>
    fun findAllByFromUserIdAndStatus(userId: UUID, status: FriendRequestStatus): List<FriendRequest>
    fun findByFromUserIdAndToUserIdAndStatus(fromUserId: UUID, toUserId: UUID, status: FriendRequestStatus): FriendRequest?
    fun findByFromUserIdAndToUserId(fromUserId: UUID, toUserId: UUID): FriendRequest?
    fun deleteByFromUserIdAndToUserId(fromUserId: UUID, toUserId: UUID): Long
}

interface FriendshipRepository : JpaRepository<Friendship, UUID> {
    fun findAllByUserId(userId: UUID): List<Friendship>
    fun existsByUserIdAndFriendUserId(userId: UUID, friendUserId: UUID): Boolean
    fun deleteByUserIdAndFriendUserId(userId: UUID, friendUserId: UUID): Long
}

interface EventInviteRepository : JpaRepository<EventInvite, UUID> {
    fun findAllByToUserIdAndStatus(userId: UUID, status: InviteStatus): List<EventInvite>
    fun findByEventIdAndToUserIdAndStatus(eventId: UUID, toUserId: UUID, status: InviteStatus): EventInvite?
    fun findAllByEventIdAndFromUserId(eventId: UUID, fromUserId: UUID): List<EventInvite>
    fun deleteAllByEventId(eventId: UUID)
}
