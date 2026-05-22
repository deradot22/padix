package com.padelgo.service

import com.padelgo.api.ApiException
import com.padelgo.api.FeedbackCategory
import com.padelgo.api.FeedbackResponse
import com.padelgo.api.SubmitFeedbackRequest
import com.padelgo.auth.UserRepository
import com.padelgo.domain.FeedbackTicket
import com.padelgo.repo.FeedbackTicketRepository
import com.padelgo.repo.PlayerRepository
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID
import kotlin.math.ceil

@Service
class FeedbackService(
    private val repo: FeedbackTicketRepository,
    private val users: UserRepository,
    private val players: PlayerRepository,
    private val botClient: BotClient
) {
    private val log = LoggerFactory.getLogger(FeedbackService::class.java)

    companion object {
        const val MIN_MESSAGE_LEN = 5
        const val MAX_MESSAGE_LEN = 5000
        // Лимит data URL после base64-кодирования. 7 MB ≈ 5.2 MB сырого бинарника.
        // Хватает скриншоту (≤2 MB) и короткому видео (≤5 MB сырого) без отдельного хранилища.
        const val MAX_ATTACHMENT_DATAURL_BYTES = 7 * 1024 * 1024
        val ALLOWED_MIMES_PREFIX = listOf("image/", "video/")
    }

    @Transactional
    fun submit(userId: UUID, req: SubmitFeedbackRequest): FeedbackResponse {
        val user = users.findById(userId).orElseThrow {
            ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized")
        }

        val message = req.message.trim()
        if (message.length < MIN_MESSAGE_LEN) {
            throw ApiException(HttpStatus.BAD_REQUEST, "Сообщение слишком короткое (минимум $MIN_MESSAGE_LEN символов)")
        }
        if (message.length > MAX_MESSAGE_LEN) {
            throw ApiException(HttpStatus.BAD_REQUEST, "Сообщение слишком длинное (максимум $MAX_MESSAGE_LEN символов)")
        }

        // Валидация attachment, если прислан.
        var mime: String? = null
        var sizeBytes: Int? = null
        val attachment = req.attachmentDataUrl?.trim()?.takeIf { it.isNotEmpty() }
        if (attachment != null) {
            if (!attachment.startsWith("data:")) {
                throw ApiException(HttpStatus.BAD_REQUEST, "Вложение должно быть data URL")
            }
            if (attachment.length > MAX_ATTACHMENT_DATAURL_BYTES) {
                val mb = MAX_ATTACHMENT_DATAURL_BYTES / 1024 / 1024
                throw ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "Вложение слишком большое (максимум ~${mb} MB закодировано)")
            }
            // data:<mime>;base64,<payload>
            val header = attachment.substringBefore(",", "")
            val payloadStart = attachment.indexOf(',')
            if (payloadStart < 0) {
                throw ApiException(HttpStatus.BAD_REQUEST, "Некорректный data URL")
            }
            val parsedMime = header.removePrefix("data:").substringBefore(";").lowercase()
            if (parsedMime.isBlank() || ALLOWED_MIMES_PREFIX.none { parsedMime.startsWith(it) }) {
                throw ApiException(HttpStatus.BAD_REQUEST, "Поддерживаются только изображения и видео")
            }
            mime = parsedMime
            // Считаем размер бинарника: base64 inflation 4/3, поэтому raw = ceil(b64Len * 3/4) минус padding.
            val b64Len = attachment.length - payloadStart - 1
            val padding = attachment.takeLast(2).count { it == '=' }
            sizeBytes = (ceil(b64Len * 3.0 / 4.0).toInt() - padding).coerceAtLeast(0)
        }

        val category = try {
            FeedbackCategory.valueOf(req.category.uppercase())
        } catch (e: IllegalArgumentException) {
            throw ApiException(HttpStatus.BAD_REQUEST, "Неизвестная категория: ${req.category}")
        }

        val ticket = repo.save(
            FeedbackTicket(
                userId = userId,
                category = category.name,
                message = message,
                attachmentDataUrl = attachment,
                attachmentMime = mime,
                attachmentSizeBytes = sizeBytes
            )
        )

        log.info(
            "[FEEDBACK] new ticket id={} user={} category={} message_len={} has_attachment={} ({} bytes)",
            ticket.id, userId, category, message.length, attachment != null, sizeBytes ?: 0
        )

        val authorName = user.playerId?.let { players.findById(it).orElse(null)?.name } ?: user.email ?: "Пользователь"

        // Fire-and-forget уведомления всем feedback-админам в TG. Ошибки бота не валят транзакцию.
        notifyAdmins(ticket, category, message, attachment, mime, authorName)

        return toResponse(ticket, authorName)
    }

    /**
     * Шлём уведомления всем юзерам с флагом `is_feedback_admin = true`.
     * Назначается в /admin (см. AdminController.updateUser). Если ни одного — no-op.
     * Бот фильтрует: у кого нет привязанного PRIVATE TG-чата — пропускается без ошибки.
     */
    private fun notifyAdmins(
        ticket: FeedbackTicket,
        category: FeedbackCategory,
        message: String,
        attachmentDataUrl: String?,
        attachmentMime: String?,
        authorName: String
    ) {
        val admins = try {
            users.findAllByIsFeedbackAdminTrue()
        } catch (e: Exception) {
            log.warn("findAllByIsFeedbackAdminTrue failed: {}", e.message)
            return
        }
        if (admins.isEmpty()) return
        admins.forEach { admin ->
            val adminId = admin.id ?: return@forEach
            try {
                botClient.notifyAdminFeedback(
                    AdminFeedbackNotify(
                        adminUserId = adminId,
                        ticketId = ticket.id!!,
                        authorName = authorName,
                        category = category.name,
                        message = message,
                        attachmentDataUrl = attachmentDataUrl,
                        attachmentMime = attachmentMime
                    )
                )
            } catch (e: Exception) {
                log.warn("notifyAdminFeedback failed for ticket {} admin {}: {}", ticket.id, adminId, e.message)
            }
        }
    }

    @Transactional(readOnly = true)
    fun listForUser(userId: UUID): List<FeedbackResponse> {
        val tickets = repo.findAllByUserIdOrderByCreatedAtDesc(userId)
        val authorName = users.findById(userId).orElse(null)?.let { u ->
            u.playerId?.let { players.findById(it).orElse(null)?.name } ?: u.email ?: "Вы"
        } ?: "Вы"
        return tickets.map { toResponse(it, authorName) }
    }

    @Transactional(readOnly = true)
    fun listAll(): List<FeedbackResponse> {
        val tickets = repo.findAllByOrderByCreatedAtDesc()
        if (tickets.isEmpty()) return emptyList()
        val userIds = tickets.mapNotNull { it.userId }.toSet()
        val usersById = users.findAllById(userIds).associateBy { it.id!! }
        val playerIds = usersById.values.mapNotNull { it.playerId }.toSet()
        val playersById = if (playerIds.isNotEmpty()) {
            players.findAllById(playerIds).associateBy { it.id!! }
        } else emptyMap()
        return tickets.map { t ->
            val u = t.userId?.let { usersById[it] }
            val name = u?.playerId?.let { playersById[it]?.name } ?: u?.email ?: "—"
            toResponse(t, name)
        }
    }

    @Transactional
    fun delete(ticketId: UUID) {
        if (!repo.existsById(ticketId)) {
            throw ApiException(HttpStatus.NOT_FOUND, "Ticket not found")
        }
        repo.deleteById(ticketId)
        log.info("[FEEDBACK] deleted ticket id={}", ticketId)
    }

    private fun toResponse(t: FeedbackTicket, authorName: String): FeedbackResponse = FeedbackResponse(
        id = t.id!!,
        userId = t.userId!!,
        authorName = authorName,
        category = t.category,
        message = t.message,
        attachmentDataUrl = t.attachmentDataUrl,
        attachmentMime = t.attachmentMime,
        attachmentSizeBytes = t.attachmentSizeBytes,
        // После repo.save() Hibernate @CreationTimestamp может не успеть отработать
        // (особенно при DB-side DEFAULT NOW()), поэтому fallback на текущее время.
        createdAt = t.createdAt ?: Instant.now()
    )
}
