package com.padelgo.service

import org.slf4j.LoggerFactory
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.boot.SpringApplication
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.ConfigurableApplicationContext
import org.springframework.stereotype.Component
import kotlin.system.exitProcess

/**
 * Одноразовый maintenance-раннер глобального пересчёта рейтингов.
 *
 * Бин создаётся ТОЛЬКО если задано `app.maintenance.recompute-all-ratings=true`, поэтому
 * обычный прод-старт его не активирует. Запуск разового пересчёта (локально против копии
 * прод-БД или против прод-БД):
 *
 *   -Dapp.maintenance.recompute-all-ratings=true \
 *   -Dapp.maintenance.run-decay=true \
 *   -Dapp.maintenance.exit-after=true \
 *   -Dapp.telegram.enabled=false
 *
 * exit-after=true завершает процесс после пересчёта — НЕ включать на постоянном
 * Render-сервисе (иначе рестарт-луп), только для разового прогона.
 */
@Component
@ConditionalOnProperty(name = ["app.maintenance.recompute-all-ratings"], havingValue = "true")
class RecomputeAllRatingsRunner(
    private val eventService: EventService,
    private val ratingDecayJob: RatingDecayJob,
    private val context: ConfigurableApplicationContext,
) : ApplicationRunner {
    private val log = LoggerFactory.getLogger(RecomputeAllRatingsRunner::class.java)

    override fun run(args: ApplicationArguments) {
        val env = context.environment
        val runDecay = env.getProperty("app.maintenance.run-decay", Boolean::class.java, false)
        val exitAfter = env.getProperty("app.maintenance.exit-after", Boolean::class.java, false)

        log.info("[MAINTENANCE] === Глобальный пересчёт рейтингов: старт ===")
        val summary = eventService.recomputeAllRatings()
        log.info("[MAINTENANCE] Пересчёт завершён: {}", summary)

        if (runDecay) {
            ratingDecayJob.applyDecay()
            log.info("[MAINTENANCE] Decay применён после пересчёта")
        }

        if (exitAfter) {
            log.info("[MAINTENANCE] exit-after=true → завершаем процесс")
            val code = SpringApplication.exit(context, org.springframework.boot.ExitCodeGenerator { 0 })
            exitProcess(code)
        }
    }
}
