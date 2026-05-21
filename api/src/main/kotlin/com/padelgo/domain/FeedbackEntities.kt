package com.padelgo.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UuidGenerator
import java.time.Instant
import java.util.UUID

/**
 * Тикет обратной связи. Создаётся юзером, читается админом.
 * MVP без статусов: ответ — внешним контактом (TG/email).
 * См. docs/PADIX_FEATURES_OVERVIEW.md §16.
 */
@Entity
@Table(name = "feedback_tickets")
class FeedbackTicket(
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    @Column(name = "user_id", nullable = false)
    var userId: UUID? = null,

    /** BUG / FEATURE / QUESTION / OTHER */
    @Column(name = "category", nullable = false, length = 16)
    var category: String = "OTHER",

    @Column(name = "message", nullable = false, columnDefinition = "TEXT")
    var message: String = "",

    /** data:image/jpeg;base64,... или data:video/mp4;base64,... — необязательно. */
    @Column(name = "attachment_data_url", columnDefinition = "TEXT")
    var attachmentDataUrl: String? = null,

    /** image/jpeg, image/png, video/mp4 и т.п. — для UI-превью. */
    @Column(name = "attachment_mime", length = 64)
    var attachmentMime: String? = null,

    /** Размер бинарника (НЕ data URL) в байтах — для UI «3.2 MB». */
    @Column(name = "attachment_size_bytes")
    var attachmentSizeBytes: Int? = null,

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant? = null
)
