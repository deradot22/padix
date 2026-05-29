package com.padelgo.auth

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

/**
 * Тесты блокировки одноразовых email. Список грузится из resources/disposable-email-domains.txt,
 * который доступен и на тестовом classpath. init() вызываем вручную (в проде это @PostConstruct).
 */
class DisposableEmailCheckerTest {

    private lateinit var checker: DisposableEmailChecker

    @BeforeEach
    fun setup() {
        checker = DisposableEmailChecker()
        checker.init()
    }

    @Test
    fun `blocks known disposable domain`() {
        assertTrue(checker.isDisposable("foo@mailinator.com"))
    }

    @Test
    fun `blocks subdomain of disposable domain`() {
        // foo.mailinator.com — поддомен заблокированного mailinator.com
        assertTrue(checker.isDisposable("bar@alias.mailinator.com"))
    }

    @Test
    fun `is case insensitive`() {
        assertTrue(checker.isDisposable("foo@MAILINATOR.COM"))
        assertTrue(checker.isDisposable("foo@MailInator.Com"))
    }

    @Test
    fun `allows normal provider domains`() {
        assertFalse(checker.isDisposable("real@gmail.com"))
        assertFalse(checker.isDisposable("real@outlook.com"))
        assertFalse(checker.isDisposable("real@padix.club"))
    }

    @Test
    fun `returns false for malformed email without at sign`() {
        assertFalse(checker.isDisposable("notanemail"))
    }

    @Test
    fun `returns false when domain part is empty`() {
        assertFalse(checker.isDisposable("foo@"))
    }

    @Test
    fun `trims surrounding whitespace in domain`() {
        assertTrue(checker.isDisposable("foo@ mailinator.com "))
    }
}
