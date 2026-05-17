package com.padelgo

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableScheduling

@SpringBootApplication
@EnableScheduling
class PadelGoApplication

fun main(args: Array<String>) {
    runApplication<PadelGoApplication>(*args)
}

