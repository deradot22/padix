# Multi-stage build — собираем jar внутри Docker.
# Контекст сборки = корень репозитория (где settings.gradle.kts и подмодули api/, bot/).
# На Render это и используется по умолчанию — Docker Context: /, Dockerfile Path: bot/Dockerfile.
FROM gradle:8.7-jdk21 AS build
WORKDIR /workspace
COPY settings.gradle.kts build.gradle.kts ./
COPY gradle ./gradle
COPY gradlew gradlew.bat ./
COPY api/build.gradle.kts ./api/build.gradle.kts
COPY bot/build.gradle.kts ./bot/build.gradle.kts
# Прогреваем кэш зависимостей до копирования исходников — повторные сборки быстрее
RUN gradle --no-daemon :bot:dependencies > /dev/null 2>&1 || true
COPY bot/src ./bot/src
RUN gradle --no-daemon :bot:bootJar -x test

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/bot/build/libs/app.jar /app/app.jar
EXPOSE 8081
ENTRYPOINT ["java","-jar","/app/app.jar"]
