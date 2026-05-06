# syntax=docker/dockerfile:1.7
#
# lc-checker-v2-svc — multi-stage image
# - Build stage:  Gradle on JDK 21 builds the Spring Boot fat jar.
# - Runtime:      eclipse-temurin 21 JRE, non-root, curl healthcheck.
# Build context: ./lc-checker-v2-svc (see infra/docker-compose.yml).

############
# Stage 1: build
############
FROM gradle:8.10.2-jdk21 AS build
WORKDIR /workspace

COPY --chown=gradle:gradle settings.gradle.kts build.gradle.kts gradle.properties* ./
COPY --chown=gradle:gradle gradle ./gradle
COPY --chown=gradle:gradle src ./src

RUN --mount=type=cache,target=/home/gradle/.gradle,uid=1000,gid=1000 \
    gradle --no-daemon clean bootJar -x test \
    && ls -lh build/libs/

############
# Stage 2: runtime
############
FROM eclipse-temurin:21-jre-jammy AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1000 app \
    && useradd --system --uid 1000 --gid app --home-dir /app --shell /usr/sbin/nologin app \
    && mkdir -p /app /app/logs \
    && chown -R app:app /app

WORKDIR /app
COPY --from=build --chown=app:app /workspace/build/libs/*.jar /app/app.jar
USER app

ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"
ENV SERVER_PORT=9082

EXPOSE 9082

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
    CMD curl -fsS http://localhost:9082/actuator/health | grep -q '"status":"UP"' || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
