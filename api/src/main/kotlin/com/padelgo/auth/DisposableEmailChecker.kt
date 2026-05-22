package com.padelgo.auth

import jakarta.annotation.PostConstruct
import org.slf4j.LoggerFactory
import org.springframework.core.io.ClassPathResource
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets

/**
 * Проверяет, что email не принадлежит одноразовому сервису (mailinator.com и т.п.).
 * Список лежит в resources/disposable-email-domains.txt — править руками по мере необходимости.
 *
 * Покрывает поддомены: если в списке "mailinator.com", то "alias.mailinator.com" тоже блокируется.
 */
@Component
class DisposableEmailChecker {
    private val log = LoggerFactory.getLogger(DisposableEmailChecker::class.java)
    private lateinit var domains: Set<String>

    @PostConstruct
    fun init() {
        val resource = ClassPathResource("disposable-email-domains.txt")
        val loaded = resource.inputStream.bufferedReader(StandardCharsets.UTF_8).useLines { lines ->
            lines
                .map { it.trim() }
                .filter { it.isNotEmpty() && !it.startsWith("#") }
                .map { it.lowercase() }
                .toSet()
        }
        domains = loaded
        log.info("Loaded {} disposable email domains for registration blocking", loaded.size)
    }

    /**
     * @return true если домен email в чёрном списке или является его поддоменом.
     */
    fun isDisposable(email: String): Boolean {
        val at = email.lastIndexOf('@')
        if (at < 0 || at == email.length - 1) return false
        val domain = email.substring(at + 1).trim().lowercase()
        if (domain.isEmpty()) return false
        if (domain in domains) return true
        // Поддомены: foo.mailinator.com → проверяем "mailinator.com", "com"...
        // Останавливаемся когда нашли точное совпадение в списке.
        var idx = domain.indexOf('.')
        while (idx >= 0 && idx < domain.length - 1) {
            val parent = domain.substring(idx + 1)
            if (parent in domains) return true
            idx = domain.indexOf('.', idx + 1)
        }
        return false
    }
}
