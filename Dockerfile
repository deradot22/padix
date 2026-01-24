FROM eclipse-temurin:17-jre
WORKDIR /app

# Build jar on host: `gradle --no-daemon clean bootJar`
COPY build/libs/app.jar /app/app.jar

EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]

