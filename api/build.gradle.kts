import org.jetbrains.kotlin.gradle.tasks.KotlinCompile
import org.springframework.boot.gradle.tasks.bundling.BootJar

plugins {
    kotlin("jvm") version "2.0.21"
    kotlin("plugin.spring") version "2.0.21"
    kotlin("plugin.jpa") version "2.0.21"
    id("org.springframework.boot") version "3.4.1"
    id("io.spring.dependency-management") version "1.1.6"
}

group = "com.padelgo"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-security")

    implementation("org.flywaydb:flyway-core")
    runtimeOnly("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")

    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.7.0")

    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")

    implementation("io.jsonwebtoken:jjwt-api:0.12.6")
    runtimeOnly("io.jsonwebtoken:jjwt-impl:0.12.6")
    runtimeOnly("io.jsonwebtoken:jjwt-jackson:0.12.6")

    // In-memory rate limiting (5 регистраций/час с IP и т.п.). См. RateLimiter.kt
    implementation("com.bucket4j:bucket4j-core:8.10.1")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    // Котлин-friendly обёртка над Mockito (whenever/any() без проблем с null-safety).
    testImplementation("org.mockito.kotlin:mockito-kotlin:5.4.0")
}

tasks.withType<KotlinCompile> {
    compilerOptions {
        freeCompilerArgs.addAll("-Xjsr305=strict")
    }
}

tasks.withType<Test> {
    useJUnitPlatform()
}

tasks.named<BootJar>("bootJar") {
    archiveFileName.set("app.jar")
}

// Разовый backfill Telegram-постов результатов (см. TelegramResultsBackfillRunner).
// Приводит уже опубликованные RESULTS-сообщения к актуальному счёту через editMessageText.
// Запуск:  ./gradlew :api:backfillTelegramResults [-Pdays=30] [-PthrottleMs=120]
// Требует те же env, что и обычный старт api (БД + APP_BOT_BASE_URL/APP_BOT_INTERNAL_SECRET).
tasks.register<org.springframework.boot.gradle.tasks.run.BootRun>("backfillTelegramResults") {
    group = "maintenance"
    description = "Разово привести Telegram-посты результатов к актуальному счёту (editMessageText)."
    mainClass.set("com.padelgo.PadelGoApplicationKt")
    classpath = sourceSets["main"].runtimeClasspath
    systemProperty("app.maintenance.backfill-telegram-results", "true")
    systemProperty("app.maintenance.exit-after", "true")
    systemProperty("app.maintenance.backfill-days", (project.findProperty("days") ?: "30").toString())
    systemProperty("app.maintenance.backfill-throttle-ms", (project.findProperty("throttleMs") ?: "120").toString())
}

