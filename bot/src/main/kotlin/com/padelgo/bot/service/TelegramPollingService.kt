package com.padelgo.bot.service

import com.padelgo.bot.domain.TelegramPollingState
import com.padelgo.bot.repo.TelegramPollingStateRepository
import org.slf4j.LoggerFactory
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean

@Component
class TelegramPollingService(
    private val client: TelegramClient,
    private val props: TelegramProps,
    private val telegramService: TelegramService,
    private val stateRepo: TelegramPollingStateRepository
) {
    private val log = LoggerFactory.getLogger(TelegramPollingService::class.java)
    private val running = AtomicBoolean(false)

    @EventListener(ApplicationReadyEvent::class)
    fun startOnReady() {
        if (!client.isConfigured()) {
            log.info("Telegram polling disabled (no token or app.telegram.enabled=false)")
            return
        }
        if (!running.compareAndSet(false, true)) return

        try {
            val me = client.getMe()
            log.info("Telegram bot ready: @{} (id={})", me.username, me.id)
        } catch (e: Exception) {
            log.error("Telegram getMe failed at startup: {}", e.message)
            running.set(false)
            return
        }

        val thread = Thread(::pollingLoop, "telegram-polling").apply {
            isDaemon = true
        }
        thread.start()
    }

    private fun pollingLoop() {
        var offset = loadOffset() + 1
        log.info("Telegram polling started from offset {}", offset)
        while (running.get() && !Thread.currentThread().isInterrupted) {
            try {
                val updates = client.getUpdates(offset, props.pollingTimeoutSeconds)
                for (update in updates) {
                    try {
                        telegramService.handleUpdate(update)
                    } catch (e: Exception) {
                        log.warn("Failed to handle Telegram update {}: {}", update.updateId, e.message)
                    }
                    offset = update.updateId + 1
                }
                if (updates.isNotEmpty()) {
                    saveOffset(updates.last().updateId)
                }
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                break
            } catch (e: Exception) {
                log.warn("Telegram getUpdates failed: {}. Retrying in 5s", e.message)
                try {
                    Thread.sleep(5000)
                } catch (ie: InterruptedException) {
                    Thread.currentThread().interrupt()
                    break
                }
            }
        }
        log.info("Telegram polling loop exited")
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun loadOffset(): Long {
        val state = stateRepo.findById(1).orElse(null) ?: return 0L
        return state.lastUpdateId
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun saveOffset(lastUpdateId: Long) {
        val state = stateRepo.findById(1).orElseGet {
            TelegramPollingState(id = 1, lastUpdateId = 0L, updatedAt = Instant.now())
        }
        state.lastUpdateId = lastUpdateId
        state.updatedAt = Instant.now()
        stateRepo.save(state)
    }
}
