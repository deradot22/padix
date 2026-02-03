package com.padelgo.api

import com.padelgo.service.SocialService
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api")
class SocialController(
    private val service: SocialService
) {
    @PostMapping("/friends/request")
    fun requestFriend(@Valid @RequestBody req: PublicIdRequest) {
        service.requestFriend(principalUserId(), req.publicId)
    }

    @PostMapping("/friends/accept")
    fun acceptFriend(@Valid @RequestBody req: PublicIdRequest) {
        service.acceptFriend(principalUserId(), req.publicId)
    }

    @PostMapping("/friends/decline")
    fun declineFriend(@Valid @RequestBody req: PublicIdRequest) {
        service.declineFriend(principalUserId(), req.publicId)
    }

    @GetMapping("/friends")
    fun listFriends() = service.listFriends(principalUserId())

    @PostMapping("/events/{eventId}/invite")
    fun invite(@PathVariable eventId: UUID, @Valid @RequestBody req: PublicIdRequest) {
        service.inviteToEvent(principalUserId(), eventId, req.publicId)
    }

    @PostMapping("/events/{eventId}/invites/accept")
    fun acceptInvite(@PathVariable eventId: UUID) {
        service.acceptInvite(principalUserId(), eventId)
    }

    @PostMapping("/events/{eventId}/invites/decline")
    fun declineInvite(@PathVariable eventId: UUID) {
        service.declineInvite(principalUserId(), eventId)
    }

    @GetMapping("/events/{eventId}/invites")
    fun eventInvites(@PathVariable eventId: UUID) = service.listEventInvites(principalUserId(), eventId)

    @GetMapping("/invites")
    fun invites() = service.listInvites(principalUserId())

    private fun principalUserId(): UUID {
        val p = org.springframework.security.core.context.SecurityContextHolder.getContext().authentication?.principal
        if (p is com.padelgo.auth.JwtPrincipal) return p.userId
        throw ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED, "Unauthorized")
    }
}

data class PublicIdRequest(
    @field:NotBlank
    val publicId: String
)
