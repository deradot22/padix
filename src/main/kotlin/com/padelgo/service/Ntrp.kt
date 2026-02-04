package com.padelgo.service

object Ntrp {
    fun fromRating(rating: Int): String = when {
        rating < 800 -> "1.0"
        rating < 900 -> "1.5"
        rating < 1000 -> "2.0"
        rating < 1100 -> "2.5"
        rating < 1200 -> "3.0"
        rating < 1300 -> "3.5"
        rating < 1400 -> "4.0"
        rating < 1500 -> "4.5"
        else -> "5.0+"
    }
}
