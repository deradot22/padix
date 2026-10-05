package com.padelgo.domain

import java.util.Locale

/** Страны игроков: принимаем только коды ISO 3166-1 alpha-2, храним в верхнем регистре. */
object Countries {
    private val codes: Set<String> = Locale.getISOCountries().toSet()

    /** Нормализованный код или null, если значение пустое либо такой страны нет. */
    fun normalize(raw: String?): String? = raw?.trim()?.uppercase()?.takeIf { it in codes }
}
