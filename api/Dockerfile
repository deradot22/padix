# Multi-stage build — собираем jar внутри Docker.
# Контекст сборки = корень репозитория (где settings.gradle.kts и подмодули api/, bot/).
# На Render это и используется по умолчанию — Docker Context: /, Dockerfile Path: api/Dockerfile.
FROM gradle:8.7-jdk21 AS build
WORKDIR /workspace
COPY settings.gradle.kts build.gradle.kts ./
COPY gradle ./gradle
COPY gradlew gradlew.bat ./
COPY api/build.gradle.kts ./api/build.gradle.kts
COPY bot/build.gradle.kts ./bot/build.gradle.kts
# Прогреваем кэш зависимостей до копирования исходников — повторные сборки быстрее
RUN gradle --no-daemon :api:dependencies > /dev/null 2>&1 || true
COPY api/src ./api/src
RUN gradle --no-daemon :api:bootJar -x test

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/api/build/libs/app.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
