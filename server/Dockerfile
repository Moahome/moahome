# syntax=docker/dockerfile:1
# 빌드와 실행에 같은 보안 패치를 사용하고 태그 변경에도 검증한 이미지를 유지합니다.
FROM eclipse-temurin:21.0.13.1_2-jdk@sha256:cc9c4fb30bc63de16c227ac3c69f237a10537449ed7ab29fae21c6441470f69c AS builder
WORKDIR /build
COPY gradlew build.gradle settings.gradle ./
COPY gradle/ gradle/
COPY src/main/ src/main/
RUN chmod +x gradlew
RUN --mount=type=cache,target=/root/.gradle ./gradlew --no-daemon bootJar

FROM eclipse-temurin:21.0.13.1_2-jre@sha256:b57b0a974dc5ba8b24009a97aeb9ffd178e172727736279e5de73605f40c6813
# 컨테이너 내부 준비 상태 점검에만 curl을 사용하며 루트 권한으로 앱을 실행하지 않습니다.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 moahome \
    && useradd --uid 10001 --gid moahome --no-create-home moahome
WORKDIR /app
COPY --from=builder --chown=10001:10001 /build/build/libs/moahome.jar app.jar
USER 10001:10001
ENV SPRING_PROFILES_ACTIVE=prod
# Git 추적에서 제외한 로컬 설정을 JAR에 포함하거나 실행 설정으로 읽지 않습니다.
ENV SPRING_CONFIG_LOCATION=classpath:application.properties
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
