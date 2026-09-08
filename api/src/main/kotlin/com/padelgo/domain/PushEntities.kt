package com.padelgo.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Table
import jakarta.persistence.Id
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import org.hibernate.annotations.UuidGenerator
import java.time.Instant
import java.util.UUID

/** Платформа устройства, с которого пришёл push-токен. */
enum class PushPlatform { ANDROID, IOS, WEB }

/**
 * Push-токен конкретного устройства пользователя (FCM).
 *
 * Клиент регистрирует токен через POST /api/push/tokens после логина и при каждой
 * ротации токена самим Firebase. Строка живёт до тех пор, пока токен не заменён
 * новым с того же устройства или пока не удалён аккаунт.
 *
 * [token] уникален глобально: если на устройстве сменился аккаунт, строка
 * переезжает на нового владельца, а не дублируется — иначе пуш ушёл бы предыдущему
 * пользователю телефона.
 */
@Entity
@Table(name = "push_tokens")
class PushToken(
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false)
    var id: UUID? = null,

    /** Внутренний ID пользователя-владельца устройства. */
    @Column(name = "user_id", nullable = false)
    var userId: UUID,

    @Column(name = "token", nullable = false, length = 512)
    var token: String,

    @Enumerated(EnumType.STRING)
    @Column(name = "platform", nullable = false, length = 16)
    var platform: PushPlatform,

    /** Идентификатор установки; по нему выкидываем прошлый токен того же устройства. */
    @Column(name = "device_id", length = 128)
    var deviceId: String? = null,

    @Column(name = "app_version", length = 32)
    var appVersion: String? = null,

    /** Модель устройства («Pixel 8 Pro», «iPhone 15») — для разбора проблем с доставкой. */
    @Column(name = "device_model", length = 128)
    var deviceModel: String? = null,

    /** Имя ОС («Android», «iOS», для web — браузер). */
    @Column(name = "os_name", length = 32)
    var osName: String? = null,

    @Column(name = "os_version", length = 32)
    var osVersion: String? = null,

    /** Язык устройства («ru-RU») — на нём формируется текст пуша. */
    @Column(name = "locale", length = 16)
    var locale: String? = null,

    /** IANA-таймзона («Europe/Moscow») — чтобы не слать пуш в ночь по местному времени. */
    @Column(name = "timezone", length = 64)
    var timezone: String? = null,

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant? = null,

    /** Обновляется при каждой перерегистрации токена — «токен ещё живой». */
    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant? = null,
)
