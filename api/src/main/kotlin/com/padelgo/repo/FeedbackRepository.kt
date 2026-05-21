package com.padelgo.repo

import com.padelgo.domain.FeedbackTicket
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface FeedbackTicketRepository : JpaRepository<FeedbackTicket, UUID> {
    fun findAllByUserIdOrderByCreatedAtDesc(userId: UUID): List<FeedbackTicket>
    fun findAllByOrderByCreatedAtDesc(): List<FeedbackTicket>
}
