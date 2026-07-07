package com.padelgo.service

import org.slf4j.LoggerFactory
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.boot.SpringApplication
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.ConfigurableApplicationContext
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.util.UUID
import kotlin.system.exitProcess

/**
 * Разовый maintenance-раннер: приводит уже опубликованные Telegram-посты результатов
 * к актуальному счёту в БД. Нужен как backfill для игр, которые финализировали/правили
 * ДО того, как заработала штатная синхронизация «правка счёта → editMessageText».
 *
 * Бин создаётся ТОЛЬКО при `app.maintenance.backfill-telegram-results=true`, поэтому обычный
 * прод-старт его не активирует. Механика: берём event_id всех RESULTS-постов за последние
 * N дней (по умолчанию 30), для каждого события собираем актуальный payload через
 * [EventService.buildResultsUpdatePayload] и шлём боту notifyEventResultsUpdated — тот делает
 * editMessageText по сохранённому chatId+messageId (event_telegram_post). Если текст не
 * изменился, Telegram отвечает 400 «message is not modified», что молча трактуется как успех
 * (см. TelegramClient.editMessageText), поэтому такие случаи не попадают в счётчик ошибок.
 *
 * Запуск (см. gradle task :api:backfillTelegramResults):
 *   -Dapp.maintenance.backfill-telegram-results=true -Dapp.maintenance.exit-after=true \
 *   [-Dapp.maintenance.backfill-days=30] [-Dapp.maintenance.backfill-throttle-ms=120]
 *
 * exit-after=true завершает процесс после прогона — НЕ включать на постоянном сервисе.
 */
@Component
@ConditionalOnProperty(name = ["app.maintenance.backfill-telegram-results"], havingValue = "true")
class TelegramResultsBackfillRunner(
    private val eventService: EventService,
    private val botClient: BotClient,
    private val jdbcTemplate: JdbcTemplate,
    private val context: ConfigurableApplicationContext,
) : ApplicationRunner {
    private val log = LoggerFactory.getLogger(TelegramResultsBackfillRunner::class.java)

    override fun run(args: ApplicationArguments) {
        val env = context.environment
        val days = env.getProperty("app.maintenance.backfill-days", Int::class.java, 30)
        val throttleMs = env.getProperty("app.maintenance.backfill-throttle-ms", Long::class.java, 120L)
        val exitAfter = env.getProperty("app.maintenance.exit-after", Boolean::class.java, false)

        val eventIds = candidateEventIds(days)
        log.info(
            "[BACKFILL] === Telegram results backfill: старт (окно {} дн, кандидатов {}, throttle {} мс) ===",
            days, eventIds.size, throttleMs
        )

        var updated = 0
        var skipped = 0
        var errors = 0
        for ((idx, eventId) in eventIds.withIndex()) {
            val payload = try {
                eventService.buildResultsUpdatePayload(eventId)
            } catch (e: Exception) {
                errors++
                log.warn("[BACKFILL] payload для event {} не собрался: {}", eventId, e.message)
                null
            }
            if (payload == null) {
                // Нечего показывать (не FINISHED / нет сыгранных матчей) — editMessageText не зовём.
                skipped++
                continue
            }
            try {
                botClient.notifyEventResultsUpdated(payload)
                updated++
            } catch (e: Exception) {
                errors++
                log.warn("[BACKFILL] notifyEventResultsUpdated для event {} упал: {}", eventId, e.message)
            }
            // Rate limit к Telegram Bot API (лимит ~30 msg/s; держим с большим запасом).
            if (idx < eventIds.size - 1 && throttleMs > 0) Thread.sleep(throttleMs)
        }

        log.info(
            "[BACKFILL] === Готово: обновлено {}, пропущено (нечего показывать) {}, ошибок {} ===",
            updated, skipped, errors
        )

        if (exitAfter) {
            log.info("[BACKFILL] exit-after=true → завершаем процесс")
            val code = SpringApplication.exit(context, org.springframework.boot.ExitCodeGenerator { 0 })
            exitProcess(code)
        }
    }

    /** Уникальные event_id, у которых есть RESULTS-пост, опубликованный за последние [days] дней. */
    private fun candidateEventIds(days: Int): List<UUID> =
        jdbcTemplate.queryForList(
            """
            select distinct event_id
            from event_telegram_post
            where post_kind = 'RESULTS'
              and posted_at >= now() - make_interval(days => ?)
            order by 1
            """.trimIndent(),
            UUID::class.java,
            days
        )
}
