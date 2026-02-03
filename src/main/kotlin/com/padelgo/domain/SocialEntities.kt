package com.padelgo.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.Id
import jakarta.persistence.Table
import jakarta.persistence.UniqueConstraint
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UuidGenerator
import java.time.Instant
import java.util.UUID

@Entity
@Table(
    name = "friend_requests",
    uniqueConstraints = [UniqueConstraint(columnNames = ["from_user_id", "to_user_id"])]
)
class FriendRequest(
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    @Column(name = "from_user_id", nullable = false)
    var fromUserId: UUID? = null,

    @Column(name = "to_user_id", nullable = false)
    var toUserId: UUID? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    var status: FriendRequestStatus = FriendRequestStatus.PENDING,

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant? = null
)

@Entity
@Table(
    name = "friends",
    uniqueConstraints = [UniqueConstraint(columnNames = ["user_id", "friend_user_id"])]
)
class Friendship(
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    @Column(name = "user_id", nullable = false)
    var userId: UUID? = null,

    @Column(name = "friend_user_id", nullable = false)
    var friendUserId: UUID? = null,

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant? = null
)

@Entity
@Table(
    name = "event_invites",
    uniqueConstraints = [UniqueConstraint(columnNames = ["event_id", "to_user_id"])]
)
class EventInvite(
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    @Column(name = "event_id", nullable = false)
    var eventId: UUID? = null,

    @Column(name = "from_user_id", nullable = false)
    var fromUserId: UUID? = null,

    @Column(name = "to_user_id", nullable = false)
    var toUserId: UUID? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    var status: InviteStatus = InviteStatus.PENDING,

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant? = null
)
