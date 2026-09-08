package com.padelgo.repo

import com.padelgo.domain.PushToken
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface PushTokenRepository : JpaRepository<PushToken, UUID> {
    fun findByToken(token: String): PushToken?

    /** Прошлые токены того же устройства — удаляются при ротации токена. */
    fun findAllByUserIdAndDeviceId(userId: UUID, deviceId: String): List<PushToken>

    fun findAllByUserId(userId: UUID): List<PushToken>

    /** Все токены юзера — удаляются вместе с аккаунтом. */
    fun deleteAllByUserId(userId: UUID)
}
