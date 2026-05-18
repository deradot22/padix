package com.padelgo.bot

import com.padelgo.bot.service.TelegramProps
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableScheduling

@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties(TelegramProps::class)
class PadixBotApplication

fun main(args: Array<String>) {
    runApplication<PadixBotApplication>(*args)
}
