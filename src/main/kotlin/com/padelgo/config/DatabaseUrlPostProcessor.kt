package com.padelgo.config

import org.springframework.boot.SpringApplication
import org.springframework.boot.env.EnvironmentPostProcessor
import org.springframework.core.Ordered
import org.springframework.core.env.ConfigurableEnvironment
import org.springframework.core.env.MapPropertySource

class DatabaseUrlPostProcessor : EnvironmentPostProcessor, Ordered {
    override fun postProcessEnvironment(
        environment: ConfigurableEnvironment,
        application: SpringApplication,
    ) {
        val propertyKey = "spring.datasource.url"
        val existing = environment.getProperty(propertyKey) ?: return
        if (existing.startsWith("jdbc:")) {
            return
        }

        val normalized = normalizeJdbcUrl(existing) ?: return
        val source = MapPropertySource(
            "normalizedDatasourceUrl",
            mapOf(propertyKey to normalized),
        )
        environment.propertySources.addFirst(source)
    }

    override fun getOrder(): Int = Ordered.HIGHEST_PRECEDENCE

    private fun normalizeJdbcUrl(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.startsWith("jdbc:")) {
            return trimmed
        }

        return when {
            trimmed.startsWith("postgresql://") -> "jdbc:$trimmed"
            trimmed.startsWith("postgres://") -> "jdbc:postgresql://" + trimmed.removePrefix("postgres://")
            trimmed.startsWith("mysql://") -> "jdbc:mysql://" + trimmed.removePrefix("mysql://")
            else -> null
        }
    }
}
