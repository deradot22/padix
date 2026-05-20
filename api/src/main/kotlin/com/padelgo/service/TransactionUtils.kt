package com.padelgo.service

import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager

/**
 * Откладывает выполнение блока до момента, когда текущая JPA-транзакция успешно
 * закоммитится. Если транзакции нет (например, вызов из @Scheduled-таска без
 * @Transactional или из юнит-теста без TM), выполняет блок сразу.
 *
 * Зачем нужен:
 *   bot работает с тем же Postgres'ом, но через свой коннект. Если api делает
 *   `eventRepo.save(...)` внутри @Transactional и сразу зовёт `botClient.notify*`,
 *   bot читает не закоммиченную ещё версию строки → отдаёт устаревшие данные
 *   (например, на 1-м `updateEvent` правит сообщение со старым названием, на
 *   2-м апдейте — с предыдущим, и т.д.). Также бывает FK violation на INSERT
 *   event_telegram_post потому что родительская строка events ещё не видна
 *   из соседнего коннекта.
 *
 *   Все вызовы api → bot, где bot читает что-то из БД по eventId, должны быть
 *   обёрнуты в runAfterCommit.
 */
inline fun runAfterCommit(crossinline action: () -> Unit) {
    if (TransactionSynchronizationManager.isSynchronizationActive()) {
        TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
            override fun afterCommit() {
                action()
            }
        })
    } else {
        action()
    }
}
