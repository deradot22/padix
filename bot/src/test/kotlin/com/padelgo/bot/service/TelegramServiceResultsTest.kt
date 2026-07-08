package com.padelgo.bot.service

import com.padelgo.bot.domain.BotEvent
import com.padelgo.bot.domain.EventStatus
import com.padelgo.bot.domain.EventTelegramPost
import com.padelgo.bot.domain.TelegramChat
import com.padelgo.bot.domain.TelegramChatType
import com.padelgo.bot.domain.TelegramUserSettings
import com.padelgo.bot.repo.BotEventRepository
import com.padelgo.bot.repo.BotEventSeriesRepository
import com.padelgo.bot.repo.BotRegistrationRepository
import com.padelgo.bot.repo.BotUserRepository
import com.padelgo.bot.repo.EventTelegramPostRepository
import com.padelgo.bot.repo.TelegramChatRepository
import com.padelgo.bot.repo.TelegramLinkTokenRepository
import com.padelgo.bot.repo.TelegramUserSettingsRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.doThrow
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import java.time.LocalDate
import java.time.LocalTime
import java.util.Optional
import java.util.UUID

/**
 * Юнит-тесты для [TelegramService.updateEventResults]. Telegram-клиент и репозитории
 * замоканы; реальный HTTP/БД не используются. Покрываем три ветки:
 *  - happy-path: есть RESULTS-пост → editMessageText, без send;
 *  - fallback: editMessageText бросает исключение → deleteMessage + sendMessage + save с новым messageId;
 *  - нет RESULTS-поста → send + сохранение записи с postKind=RESULTS.
 */
class TelegramServiceResultsTest {

    private lateinit var client: TelegramClient
    private lateinit var postRepo: EventTelegramPostRepository
    private lateinit var chatRepo: TelegramChatRepository
    private lateinit var settingsRepo: TelegramUserSettingsRepository
    private lateinit var service: TelegramService

    private val ownerUserId = UUID.randomUUID()
    private val eventId = UUID.randomUUID()
    private val chatInternalId = UUID.randomUUID()
    private val tgChatId = 555L

    @BeforeEach
    fun setup() {
        client = mock()
        postRepo = mock()
        chatRepo = mock()
        settingsRepo = mock()

        val props = TelegramProps(enabled = true, botToken = "test-token", botUsername = "padixbot")

        service = TelegramService(
            client = client,
            props = props,
            tokenRepo = mock<TelegramLinkTokenRepository>(),
            chatRepo = chatRepo,
            postRepo = postRepo,
            settingsRepo = settingsRepo,
            userRepo = mock<BotUserRepository>(),
            seriesRepo = mock<BotEventSeriesRepository>(),
            eventRepo = mock<BotEventRepository>(),
            regRepo = mock<BotRegistrationRepository>(),
            authTokenRepo = mock(),
            apiClient = mock<ApiClient>(),
        )
        // publicBaseUrl обычно инжектится через @Value — выставляем рефлексией.
        val field = TelegramService::class.java.getDeclaredField("publicBaseUrl")
        field.isAccessible = true
        field.set(service, "http://localhost:8083")

        // isReadyToSend → client.isConfigured() (true для enabled props) + settings.enabled.
        whenever(client.isConfigured()).doReturn(true)
        whenever(settingsRepo.findById(ownerUserId))
            .doReturn(Optional.of(TelegramUserSettings(userId = ownerUserId, enabled = true)))
    }

    private fun event() = BotEvent(
        id = eventId,
        title = "Вечерняя американка",
        date = LocalDate.of(2026, 6, 20),
        startTime = LocalTime.of(19, 0),
        endTime = LocalTime.of(21, 0),
        courtsCount = 2,
        status = EventStatus.FINISHED,
        createdByUserId = ownerUserId
    )

    private fun chat() = TelegramChat(
        id = chatInternalId,
        userId = ownerUserId,
        chatId = tgChatId,
        chatType = TelegramChatType.GROUP.name,
        title = "Падел-чат"
    )

    private val top = listOf(FinishTopPlayer("Иван", 12))
    private val leaderboard = listOf(FinishLeaderboardEntry("Иван", 40))

    @Test
    fun `happy path edits existing RESULTS post without sending`() {
        val post = EventTelegramPost(
            id = UUID.randomUUID(),
            eventId = eventId,
            telegramChatId = chatInternalId,
            messageId = 100L,
            postKind = "RESULTS"
        )
        whenever(postRepo.findAllByEventIdAndPostKind(eventId, "RESULTS")).doReturn(listOf(post))
        whenever(chatRepo.findAllByUserIdOrderByLinkedAtAsc(ownerUserId)).doReturn(listOf(chat()))

        val sent = service.updateEventResults(event(), ownerUserId, top, leaderboard, 5)

        assertEquals(1, sent)
        verify(client).editMessageText(eq(tgChatId), eq(100L), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull())
        verify(client, never()).sendMessage(anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull())
        verify(client, never()).deleteMessage(anyOrNull(), anyOrNull())
    }

    @Test
    fun `fallback deletes and re-sends when edit throws`() {
        val post = EventTelegramPost(
            id = UUID.randomUUID(),
            eventId = eventId,
            telegramChatId = chatInternalId,
            messageId = 100L,
            postKind = "RESULTS"
        )
        whenever(postRepo.findAllByEventIdAndPostKind(eventId, "RESULTS")).doReturn(listOf(post))
        whenever(chatRepo.findAllByUserIdOrderByLinkedAtAsc(ownerUserId)).doReturn(listOf(chat()))
        doThrow(TelegramApiException("message can't be edited"))
            .whenever(client).editMessageText(eq(tgChatId), eq(100L), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull())
        whenever(client.sendMessage(eq(tgChatId), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull()))
            .doReturn(TgSentMessage(messageId = 200L, chat = TgChat(id = tgChatId, type = "group")))

        val sent = service.updateEventResults(event(), ownerUserId, top, leaderboard, 5)

        assertEquals(1, sent)
        verify(client).deleteMessage(eq(tgChatId), eq(100L))
        verify(client).sendMessage(eq(tgChatId), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull())
        val captor = argumentCaptor<EventTelegramPost>()
        verify(postRepo).save(captor.capture())
        assertEquals(200L, captor.firstValue.messageId)
        assertEquals("RESULTS", captor.firstValue.postKind)
    }

    @Test
    fun `таблица лидеров — по среднему счёту за матч при разной наигранности`() {
        val post = EventTelegramPost(
            id = UUID.randomUUID(),
            eventId = eventId,
            telegramChatId = chatInternalId,
            messageId = 100L,
            postKind = "RESULTS"
        )
        whenever(postRepo.findAllByEventIdAndPostKind(eventId, "RESULTS")).doReturn(listOf(post))
        whenever(chatRepo.findAllByUserIdOrderByLinkedAtAsc(ownerUserId)).doReturn(listOf(chat()))
        // Порядок задаёт api (по нормализованному среднему): Алина 92/7=13.1 выше Sergio 99/8=12.4.
        val lb = listOf(
            FinishLeaderboardEntry("Алина", 92, 7),
            FinishLeaderboardEntry("Sergio", 99, 8)
        )

        service.updateEventResults(event(), ownerUserId, top, lb, 9)

        val textCap = argumentCaptor<String>()
        verify(client).editMessageText(eq(tgChatId), eq(100L), textCap.capture(), anyOrNull(), anyOrNull(), anyOrNull())
        val text = textCap.firstValue
        assertTrue(text.contains("13.1</b>/матч · 92"), "Алина: 13.1/матч + сумма 92; текст: $text")
        assertTrue(text.contains("12.4</b>/матч · 99"), "Sergio: 12.4/матч + сумма 99")
        assertTrue(text.contains("среднему счёту за матч"), "приписка про разную наигранность")
        assertTrue(text.indexOf("Алина") < text.indexOf("Sergio"), "Алина выше Sergio по среднему")
    }

    @Test
    fun `postEventFinished сохраняет RESULTS-пост с messageId, вернувшимся из sendMessage`() {
        // Первичная финализация: RESULTS-поста ещё нет, целевой чат берётся по ANNOUNCE-посту.
        val announce = EventTelegramPost(
            id = UUID.randomUUID(),
            eventId = eventId,
            telegramChatId = chatInternalId,
            messageId = 50L,
            postKind = "ANNOUNCE"
        )
        whenever(postRepo.findAllByEventIdAndPostKind(eventId, "ANNOUNCE")).doReturn(listOf(announce))
        whenever(chatRepo.findAllByUserIdOrderByLinkedAtAsc(ownerUserId)).doReturn(listOf(chat()))
        whenever(client.sendMessage(eq(tgChatId), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull()))
            .doReturn(TgSentMessage(messageId = 777L, chat = TgChat(id = tgChatId, type = "group")))

        val sent = service.postEventFinished(event(), ownerUserId, top, leaderboard, 5)

        assertEquals(1, sent)
        // messageId из ответа Telegram сохраняется в event_telegram_post c postKind=RESULTS —
        // именно по нему updateEventResults потом делает editMessageText при правке счёта.
        val captor = argumentCaptor<EventTelegramPost>()
        verify(postRepo).save(captor.capture())
        assertEquals(777L, captor.firstValue.messageId)
        assertEquals("RESULTS", captor.firstValue.postKind)
        assertEquals(eventId, captor.firstValue.eventId)
        assertEquals(chatInternalId, captor.firstValue.telegramChatId)
    }

    @Test
    fun `sends new RESULTS post when none exists`() {
        whenever(postRepo.findAllByEventIdAndPostKind(eventId, "RESULTS")).doReturn(emptyList())
        // targetChatsForEvent ищет ANNOUNCE-посты, затем маппит на чаты.
        val announce = EventTelegramPost(
            id = UUID.randomUUID(),
            eventId = eventId,
            telegramChatId = chatInternalId,
            messageId = 50L,
            postKind = "ANNOUNCE"
        )
        whenever(postRepo.findAllByEventIdAndPostKind(eventId, "ANNOUNCE")).doReturn(listOf(announce))
        whenever(chatRepo.findAllByUserIdOrderByLinkedAtAsc(ownerUserId)).doReturn(listOf(chat()))
        whenever(client.sendMessage(eq(tgChatId), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull()))
            .doReturn(TgSentMessage(messageId = 300L, chat = TgChat(id = tgChatId, type = "group")))

        val sent = service.updateEventResults(event(), ownerUserId, top, leaderboard, 5)

        assertEquals(1, sent)
        verify(client).sendMessage(eq(tgChatId), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull())
        verify(client, never()).editMessageText(anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull(), anyOrNull())
        val captor = argumentCaptor<EventTelegramPost>()
        verify(postRepo).save(captor.capture())
        assertEquals(300L, captor.firstValue.messageId)
        assertEquals("RESULTS", captor.firstValue.postKind)
    }
}
