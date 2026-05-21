package com.padelgo.api

import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.NotBlank
import java.time.Instant
import java.util.UUID

/** Категории тикетов обратной связи. */
enum class FeedbackCategory {
    BUG,        // «Что-то сломалось»
    FEATURE,    // «Хочется такую фичу»
    QUESTION,   // «Как сделать X?»
    OTHER       // прочее
}

@Schema(description = "Создать тикет обратной связи (фаза 1, без статусов)")
data class SubmitFeedbackRequest(
    @field:NotBlank
    @Schema(description = "Категория", example = "BUG", allowableValues = ["BUG", "FEATURE", "QUESTION", "OTHER"])
    val category: String,

    @field:NotBlank
    @Schema(description = "Текст обращения (5..5000 символов)", example = "На странице /games кнопка «Создать» не работает на iPhone Safari")
    val message: String,

    @Schema(
        description = "Опциональное вложение — фото или видео как data URL (data:image/jpeg;base64,... или data:video/mp4;base64,...). " +
            "Лимит размера ~7 MB после base64-кодирования. Поддерживаются image/* и video/*.",
        nullable = true
    )
    val attachmentDataUrl: String? = null
)

@Schema(description = "Тикет обратной связи")
data class FeedbackResponse(
    val id: UUID,
    @Schema(description = "UUID юзера, оставившего тикет")
    val userId: UUID,
    @Schema(description = "Имя автора (для отображения в админке)")
    val authorName: String,
    @Schema(description = "Категория: BUG / FEATURE / QUESTION / OTHER")
    val category: String,
    val message: String,
    @Schema(description = "data URL вложения. null — без вложения")
    val attachmentDataUrl: String? = null,
    @Schema(description = "MIME-тип вложения, e.g. image/jpeg или video/mp4")
    val attachmentMime: String? = null,
    @Schema(description = "Размер бинарника вложения в байтах")
    val attachmentSizeBytes: Int? = null,
    val createdAt: Instant
)
