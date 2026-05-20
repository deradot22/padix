package com.padelgo.api

import com.padelgo.service.SocialService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import io.swagger.v3.oas.annotations.media.Schema
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@Tag(name = "Social", description = "Друзья и приглашения на игры")
@SecurityRequirement(name = "BearerAuth")
@RestController
@RequestMapping("/api")
class SocialController(
    private val service: SocialService
) {
    @Operation(summary = "Отправить заявку в друзья по публичному ID")
    @PostMapping("/friends/request")
    fun requestFriend(@Valid @RequestBody req: PublicIdRequest) {
        service.requestFriend(principalUserId(), req.publicId)
    }

    @Operation(summary = "Принять входящую заявку в друзья")
    @PostMapping("/friends/accept")
    fun acceptFriend(@Valid @RequestBody req: PublicIdRequest) {
        service.acceptFriend(principalUserId(), req.publicId)
    }

    @Operation(summary = "Отклонить входящую заявку в друзья")
    @PostMapping("/friends/decline")
    fun declineFriend(@Valid @RequestBody req: PublicIdRequest) {
        service.declineFriend(principalUserId(), req.publicId)
    }

    @Operation(
        summary = "Список друзей и заявок",
        description = "Возвращает: friends — принятые друзья, incoming — входящие заявки, outgoing — исходящие заявки."
    )
    @GetMapping("/friends")
    fun listFriends() = service.listFriends(principalUserId())

    @Operation(summary = "Пригласить друга на игру по публичному ID")
    @PostMapping("/events/{eventId}/invite")
    fun invite(@PathVariable eventId: UUID, @Valid @RequestBody req: PublicIdRequest) {
        service.inviteToEvent(principalUserId(), eventId, req.publicId)
    }

    @Operation(summary = "Добавить друга в игру СРАЗУ без подтверждения (только автор)")
    @PostMapping("/events/{eventId}/add-friend")
    fun addFriend(@PathVariable eventId: UUID, @Valid @RequestBody req: PublicIdRequest) {
        service.addFriendToEvent(principalUserId(), eventId, req.publicId)
    }

    @Operation(summary = "Принять приглашение на игру")
    @PostMapping("/events/{eventId}/invites/accept")
    fun acceptInvite(@PathVariable eventId: UUID) {
        service.acceptInvite(principalUserId(), eventId)
    }

    @Operation(summary = "Отклонить приглашение на игру")
    @PostMapping("/events/{eventId}/invites/decline")
    fun declineInvite(@PathVariable eventId: UUID) {
        service.declineInvite(principalUserId(), eventId)
    }

    @Operation(summary = "Статус приглашений для конкретной игры (кого пригласил текущий пользователь)")
    @GetMapping("/events/{eventId}/invites")
    fun eventInvites(@PathVariable eventId: UUID) = service.listEventInvites(principalUserId(), eventId)

    @Operation(summary = "Все входящие приглашения на игры для текущего пользователя")
    @GetMapping("/invites")
    fun invites() = service.listInvites(principalUserId())

    private fun principalUserId(): UUID {
        val p = org.springframework.security.core.context.SecurityContextHolder.getContext().authentication?.principal
        if (p is com.padelgo.auth.JwtPrincipal) return p.userId
        throw ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED, "Unauthorized")
    }
}

@Schema(description = "Запрос с публичным ID пользователя")
data class PublicIdRequest(
    @field:NotBlank
    @Schema(description = "Публичный ID формата «#123456789»", example = "#867643557")
    val publicId: String
)
