package com.padelgo.service

import com.padelgo.api.ApiException
import com.padelgo.domain.EventInvite
import com.padelgo.domain.FriendRequest
import com.padelgo.domain.FriendRequestStatus
import com.padelgo.domain.Friendship
import com.padelgo.domain.InviteStatus
import com.padelgo.repo.EventInviteRepository
import com.padelgo.repo.EventRepository
import com.padelgo.repo.FriendRequestRepository
import com.padelgo.repo.FriendshipRepository
import com.padelgo.repo.PlayerRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class SocialService(
    private val users: com.padelgo.auth.UserRepository,
    private val players: PlayerRepository,
    private val events: EventRepository,
    private val friendRequests: FriendRequestRepository,
    private val friends: FriendshipRepository,
    private val invites: EventInviteRepository,
    private val eventService: EventService
) {
    fun requestFriend(userId: UUID, publicIdRaw: String) {
        val target = userByPublicId(publicIdRaw)
        if (target.id == userId) throw ApiException(HttpStatus.BAD_REQUEST, "Cannot add yourself")
        if (friends.existsByUserIdAndFriendUserId(userId, target.id!!)) {
            throw ApiException(HttpStatus.CONFLICT, "Already friends")
        }
        val existing = friendRequests.findByFromUserIdAndToUserIdAndStatus(userId, target.id!!, FriendRequestStatus.PENDING)
        if (existing != null) throw ApiException(HttpStatus.CONFLICT, "Request already sent")
        val reverse = friendRequests.findByFromUserIdAndToUserIdAndStatus(target.id!!, userId, FriendRequestStatus.PENDING)
        if (reverse != null) throw ApiException(HttpStatus.CONFLICT, "User already sent request")
        friendRequests.save(FriendRequest(fromUserId = userId, toUserId = target.id!!, status = FriendRequestStatus.PENDING))
    }

    fun acceptFriend(userId: UUID, publicIdRaw: String) {
        val from = userByPublicId(publicIdRaw)
        val req = friendRequests.findByFromUserIdAndToUserIdAndStatus(from.id!!, userId, FriendRequestStatus.PENDING)
            ?: throw ApiException(HttpStatus.NOT_FOUND, "Request not found")
        req.status = FriendRequestStatus.ACCEPTED
        friendRequests.save(req)
        if (!friends.existsByUserIdAndFriendUserId(userId, from.id!!)) {
            friends.save(Friendship(userId = userId, friendUserId = from.id!!))
        }
        if (!friends.existsByUserIdAndFriendUserId(from.id!!, userId)) {
            friends.save(Friendship(userId = from.id!!, friendUserId = userId))
        }
    }

    fun declineFriend(userId: UUID, publicIdRaw: String) {
        val from = userByPublicId(publicIdRaw)
        val req = friendRequests.findByFromUserIdAndToUserIdAndStatus(from.id!!, userId, FriendRequestStatus.PENDING)
            ?: throw ApiException(HttpStatus.NOT_FOUND, "Request not found")
        req.status = FriendRequestStatus.DECLINED
        friendRequests.save(req)
    }

    fun listFriends(userId: UUID): FriendsSnapshot {
        val myFriends = friends.findAllByUserId(userId)
        val friendIds = myFriends.mapNotNull { it.friendUserId }.toSet()
        val userById = users.findAllById(friendIds).associateBy { it.id!! }
        val playerIds = userById.values.mapNotNull { it.playerId }.toSet()
        val playerById = players.findAllById(playerIds).associateBy { it.id!! }

        val friendList = friendIds.mapNotNull { fid ->
            val user = userById[fid] ?: return@mapNotNull null
            val player = user.playerId?.let { playerById[it] }
            FriendItem(
                userId = user.id!!,
                publicId = formatPublicId(user.publicId),
                name = player?.name ?: user.email,
                rating = player?.rating ?: 0,
                ntrp = player?.ntrp ?: "1.0",
                gamesPlayed = player?.gamesPlayed ?: 0,
                calibrationEventsRemaining = user.calibrationEventsRemaining,
                avatarUrl = player?.avatarUrl
            )
        }.sortedBy { it.name.lowercase() }

        val incoming = friendRequests.findAllByToUserIdAndStatus(userId, FriendRequestStatus.PENDING)
        val outgoing = friendRequests.findAllByFromUserIdAndStatus(userId, FriendRequestStatus.PENDING)

        return FriendsSnapshot(
            friends = friendList,
            incoming = mapRequests(incoming, requestToCurrent = true),
            outgoing = mapRequests(outgoing, requestToCurrent = false)
        )
    }

    fun inviteToEvent(userId: UUID, eventId: UUID, publicIdRaw: String) {
        val event = events.findById(eventId).orElseThrow { ApiException(HttpStatus.NOT_FOUND, "Event not found") }
        if (event.createdByUserId != userId) throw ApiException(HttpStatus.FORBIDDEN, "Only author can invite")
        val target = userByPublicId(publicIdRaw)
        if (!friends.existsByUserIdAndFriendUserId(userId, target.id!!)) {
            throw ApiException(HttpStatus.FORBIDDEN, "You can invite only friends")
        }
        val existing = invites.findByEventIdAndToUserIdAndStatus(eventId, target.id!!, InviteStatus.PENDING)
        if (existing != null) throw ApiException(HttpStatus.CONFLICT, "Invite already sent")
        invites.save(EventInvite(eventId = eventId, fromUserId = userId, toUserId = target.id!!, status = InviteStatus.PENDING))
    }

    fun listInvites(userId: UUID): List<EventInviteItem> {
        val items = invites.findAllByToUserIdAndStatus(userId, InviteStatus.PENDING)
        if (items.isEmpty()) return emptyList()
        val eventsById = events.findAllById(items.mapNotNull { it.eventId }.toSet()).associateBy { it.id!! }
        val fromUsers = users.findAllById(items.mapNotNull { it.fromUserId }.toSet()).associateBy { it.id!! }
        val playerIds = fromUsers.values.mapNotNull { it.playerId }.toSet()
        val playersById = players.findAllById(playerIds).associateBy { it.id!! }

        return items.mapNotNull { inv ->
            val event = eventsById[inv.eventId] ?: return@mapNotNull null
            val fromUser = fromUsers[inv.fromUserId] ?: return@mapNotNull null
            val fromPlayer = fromUser.playerId?.let { playersById[it] }
            EventInviteItem(
                eventId = event.id!!,
                eventTitle = event.title,
                eventDate = event.date.toString(),
                fromName = fromPlayer?.name ?: fromUser.email,
                fromPublicId = formatPublicId(fromUser.publicId)
            )
        }.sortedWith(compareBy({ it.eventDate }, { it.eventTitle }))
    }

    fun acceptInvite(userId: UUID, eventId: UUID) {
        val invite = invites.findByEventIdAndToUserIdAndStatus(eventId, userId, InviteStatus.PENDING)
            ?: throw ApiException(HttpStatus.NOT_FOUND, "Invite not found")
        val user = users.findById(userId).orElseThrow { ApiException(HttpStatus.NOT_FOUND, "User not found") }
        val playerId = user.playerId ?: throw ApiException(HttpStatus.NOT_FOUND, "Player not found")
        eventService.register(eventId, playerId)
        invite.status = InviteStatus.ACCEPTED
        invites.save(invite)
    }

    fun declineInvite(userId: UUID, eventId: UUID) {
        val invite = invites.findByEventIdAndToUserIdAndStatus(eventId, userId, InviteStatus.PENDING)
            ?: throw ApiException(HttpStatus.NOT_FOUND, "Invite not found")
        invite.status = InviteStatus.DECLINED
        invites.save(invite)
    }

    fun listEventInvites(userId: UUID, eventId: UUID): List<EventInviteStatusItem> {
        val event = events.findById(eventId).orElseThrow { ApiException(HttpStatus.NOT_FOUND, "Event not found") }
        if (event.createdByUserId != userId) return emptyList()
        val items = invites.findAllByEventIdAndFromUserId(eventId, userId)
        if (items.isEmpty()) return emptyList()
        val toUsers = users.findAllById(items.mapNotNull { it.toUserId }.toSet()).associateBy { it.id!! }
        val playerIds = toUsers.values.mapNotNull { it.playerId }.toSet()
        val playersById = players.findAllById(playerIds).associateBy { it.id!! }

        return items.mapNotNull { inv ->
            val user = toUsers[inv.toUserId] ?: return@mapNotNull null
            val player = user.playerId?.let { playersById[it] }
            EventInviteStatusItem(
                publicId = formatPublicId(user.publicId),
                name = player?.name ?: user.email,
                status = inv.status
            )
        }.sortedBy { it.name.lowercase() }
    }

    private fun userByPublicId(raw: String): com.padelgo.auth.UserAccount {
        val parsed = raw.trim().removePrefix("#")
        val publicId = parsed.toLongOrNull() ?: throw ApiException(HttpStatus.BAD_REQUEST, "Invalid public id")
        return users.findByPublicId(publicId) ?: throw ApiException(HttpStatus.NOT_FOUND, "User not found")
    }

    private fun formatPublicId(publicId: Long): String = "#$publicId"

    private fun mapRequests(
        requests: List<FriendRequest>,
        requestToCurrent: Boolean
    ): List<FriendRequestItem> {
        if (requests.isEmpty()) return emptyList()
        val userIds = requests.mapNotNull { if (requestToCurrent) it.fromUserId else it.toUserId }.toSet()
        val usersById = users.findAllById(userIds).associateBy { it.id!! }
        val playerIds = usersById.values.mapNotNull { it.playerId }.toSet()
        val playersById = players.findAllById(playerIds).associateBy { it.id!! }

        return requests.mapNotNull { req ->
            val otherId = if (requestToCurrent) req.fromUserId else req.toUserId
            val user = otherId?.let { usersById[it] } ?: return@mapNotNull null
            val player = user.playerId?.let { playersById[it] }
            FriendRequestItem(
                publicId = formatPublicId(user.publicId),
                name = player?.name ?: user.email,
                avatarUrl = player?.avatarUrl
            )
        }.sortedBy { it.name.lowercase() }
    }
}

data class FriendItem(
    val userId: UUID,
    val publicId: String,
    val name: String,
    val rating: Int,
    val ntrp: String,
    val gamesPlayed: Int,
    val calibrationEventsRemaining: Int,
    val avatarUrl: String? = null
)

data class FriendRequestItem(
    val publicId: String,
    val name: String,
    val avatarUrl: String? = null
)

data class FriendsSnapshot(
    val friends: List<FriendItem>,
    val incoming: List<FriendRequestItem>,
    val outgoing: List<FriendRequestItem>
)

data class EventInviteItem(
    val eventId: UUID,
    val eventTitle: String,
    val eventDate: String,
    val fromName: String,
    val fromPublicId: String
)

data class EventInviteStatusItem(
    val publicId: String,
    val name: String,
    val status: InviteStatus
)
