package com.padelgo.repo

import com.padelgo.domain.EventCourt
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface EventCourtRepository : JpaRepository<EventCourt, UUID> {
    fun findAllByEventIdOrderByCourtNumberAsc(eventId: UUID): List<EventCourt>
    fun deleteAllByEventId(eventId: UUID)
}
