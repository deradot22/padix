FROM gradle:8.7-jdk17 AS build
WORKDIR /app
COPY . .
ENV GRADLE_OPTS="-Xmx1g -XX:MaxMetaspaceSize=512m"
RUN gradle --no-daemon clean bootJar

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/build/libs/app.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]

