package com.padelgo.auth

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface UserRepository : JpaRepository<UserAccount, UUID> {
    fun findByEmailIgnoreCase(email: String): UserAccount?
    fun findByPlayerId(playerId: UUID): UserAccount?
    fun findAllByPlayerIdIn(playerIds: Collection<UUID>): List<UserAccount>
}

