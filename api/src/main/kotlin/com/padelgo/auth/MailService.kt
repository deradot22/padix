package com.padelgo.auth

import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.web.client.RestClient

/**
 * Абстракция отправки писем. В dev по-умолчанию используется [ConsoleMailService] —
 * он просто пишет ссылку верификации в лог, что удобно для локальной разработки без SMTP.
 *
 * В проде надо задать переменные окружения:
 *   - RESEND_API_KEY=re_xxx          (получить на resend.com)
 *   - APP_MAIL_FROM="Padix <noreply@padix.club>"
 *   - APP_PUBLIC_BASE_URL=https://padix.club
 *
 * При наличии RESEND_API_KEY автоматически активируется [ResendMailService].
 */
interface MailService {
    fun sendEmailVerification(toEmail: String, toName: String, verifyUrl: String)

    /**
     * Подтверждение привязки Telegram к существующему email-аккаунту.
     * Шлётся когда юзер на bot-login форме вбил email который уже в БД.
     */
    fun sendTelegramLinkConfirmation(toEmail: String, toName: String, telegramName: String, confirmUrl: String)
}

@Configuration
class MailConfig {

    /**
     * Один bean MailService. Если RESEND_API_KEY непустой → ResendMailService,
     * иначе fallback на ConsoleMailService.
     *
     * `@ConditionalOnProperty` не умеет различать пустую строку и отсутствие свойства,
     * поэтому проверяем в коде явно — иначе в dev (где env-var проброшен пустым)
     * Spring бы создал ResendMailService с пустым ключом.
     */
    @Bean
    fun mailService(
        @Value("\${app.mail.resend.api-key:}") apiKey: String,
        @Value("\${app.mail.from:Padix <noreply@padix.club>}") from: String,
    ): MailService =
        if (apiKey.isBlank()) ConsoleMailService()
        else ResendMailService(apiKey, from)
}

class ConsoleMailService : MailService {
    private val log = LoggerFactory.getLogger(ConsoleMailService::class.java)

    override fun sendEmailVerification(toEmail: String, toName: String, verifyUrl: String) {
        log.info(
            "[MAIL/CONSOLE] Email verification for {} ({}). Open this URL to verify:\n  {}",
            toEmail, toName, verifyUrl,
        )
    }

    override fun sendTelegramLinkConfirmation(
        toEmail: String,
        toName: String,
        telegramName: String,
        confirmUrl: String,
    ) {
        log.info(
            "[MAIL/CONSOLE] Telegram link confirmation for {} ({}) - linking TG account '{}'. URL:\n  {}",
            toEmail, toName, telegramName, confirmUrl,
        )
    }
}

class ResendMailService(
    private val apiKey: String,
    private val from: String,
) : MailService {
    private val log = LoggerFactory.getLogger(ResendMailService::class.java)
    private val mapper = ObjectMapper()
    private val client: RestClient = RestClient.builder()
        .baseUrl("https://api.resend.com")
        .build()

    override fun sendEmailVerification(toEmail: String, toName: String, verifyUrl: String) {
        val safeName = toName.ifBlank { "игрок" }
        send(
            toEmail = toEmail,
            subject = "Подтвердите email · Padix",
            html = verifyEmailHtml(safeName, verifyUrl),
            text = verifyEmailText(safeName, verifyUrl),
            kind = "verification",
        )
    }

    override fun sendTelegramLinkConfirmation(
        toEmail: String,
        toName: String,
        telegramName: String,
        confirmUrl: String,
    ) {
        val safeName = toName.ifBlank { "игрок" }
        val safeTg = telegramName.ifBlank { "пользователь Telegram" }
        send(
            toEmail = toEmail,
            subject = "Привязать Telegram к Padix?",
            html = tgLinkHtml(safeName, safeTg, confirmUrl),
            text = tgLinkText(safeName, safeTg, confirmUrl),
            kind = "tg-link",
        )
    }

    private fun send(toEmail: String, subject: String, html: String, text: String, kind: String) {
        val payload = mapOf(
            "from" to from,
            "to" to listOf(toEmail),
            "subject" to subject,
            "html" to html,
            "text" to text,
        )
        try {
            val response = client.post()
                .uri("/emails")
                .header(HttpHeaders.AUTHORIZATION, "Bearer $apiKey")
                .contentType(MediaType.APPLICATION_JSON)
                .body(mapper.writeValueAsString(payload))
                .retrieve()
                .toEntity(String::class.java)
            if (response.statusCode.is2xxSuccessful) {
                log.info("[MAIL/RESEND] sent {} to {} (response={})", kind, toEmail, response.statusCode)
            } else {
                log.warn("[MAIL/RESEND] non-2xx sending {} to {}: status={} body={}", kind, toEmail, response.statusCode, response.body)
            }
        } catch (e: Exception) {
            log.error("[MAIL/RESEND] failed to send {} to {}", kind, toEmail, e)
        }
    }

    private fun verifyEmailHtml(name: String, link: String): String = """
        <!doctype html>
        <html lang="ru">
        <body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#0b0b0c; color:#e7e7ea; padding:32px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:560px; margin:0 auto; background:#141417; border-radius:12px; padding:32px;">
            <tr><td>
              <h1 style="margin:0 0 12px; font-size:22px;">Привет, $name 👋</h1>
              <p style="margin:0 0 16px; color:#a8a8b3;">Подтверди свой email, чтобы продолжить пользоваться Padix.</p>
              <p style="margin:24px 0;">
                <a href="$link" style="display:inline-block; background:#22c55e; color:#0b0b0c; padding:12px 24px; border-radius:8px; font-weight:600; text-decoration:none;">Подтвердить email</a>
              </p>
              <p style="margin:16px 0 0; color:#7a7a85; font-size:12px;">Ссылка действует 24 часа. Если ты не регистрировался — просто проигнорируй это письмо.</p>
              <p style="margin:24px 0 0; color:#7a7a85; font-size:12px; word-break:break-all;">$link</p>
            </td></tr>
          </table>
        </body>
        </html>
    """.trimIndent()

    private fun verifyEmailText(name: String, link: String): String = """
        Привет, $name!

        Подтверди свой email, чтобы продолжить пользоваться Padix:
        $link

        Ссылка действует 24 часа. Если ты не регистрировался — просто проигнорируй это письмо.
    """.trimIndent()

    private fun tgLinkHtml(name: String, telegramName: String, link: String): String = """
        <!doctype html>
        <html lang="ru">
        <body style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#0b0b0c; color:#e7e7ea; padding:32px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:560px; margin:0 auto; background:#141417; border-radius:12px; padding:32px;">
            <tr><td>
              <h1 style="margin:0 0 12px; font-size:22px;">Привет, $name 👋</h1>
              <p style="margin:0 0 16px; color:#a8a8b3;">
                Telegram-аккаунт <b>$telegramName</b> запросил привязку к твоему профилю Padix.
                Если это ты — подтверди, чтобы войти в Padix через Telegram в будущем.
              </p>
              <p style="margin:24px 0;">
                <a href="$link" style="display:inline-block; background:#22c55e; color:#0b0b0c; padding:12px 24px; border-radius:8px; font-weight:600; text-decoration:none;">Привязать Telegram</a>
              </p>
              <p style="margin:16px 0 0; color:#7a7a85; font-size:12px;">
                Ссылка действует 30 минут. <b>Если это не ты — просто проигнорируй это письмо</b>,
                никаких изменений в твоём аккаунте без клика по ссылке не произойдёт.
              </p>
              <p style="margin:24px 0 0; color:#7a7a85; font-size:12px; word-break:break-all;">$link</p>
            </td></tr>
          </table>
        </body>
        </html>
    """.trimIndent()

    private fun tgLinkText(name: String, telegramName: String, link: String): String = """
        Привет, $name!

        Telegram-аккаунт «$telegramName» запросил привязку к твоему Padix-профилю.
        Подтверди по ссылке (действует 30 минут):
        $link

        Если это не ты — просто проигнорируй письмо.
    """.trimIndent()
}
