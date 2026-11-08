package com.moahome.server.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** 키 원문 대신 서버의 버킷·리전과 선택적인 로컬 AWS 프로필만 설정합니다. */
@ConfigurationProperties(prefix = "moahome.storage.s3")
public record S3Properties(String bucket, String region, String profile) {
}
