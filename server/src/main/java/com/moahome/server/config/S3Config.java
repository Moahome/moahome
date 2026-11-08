package com.moahome.server.config;

import java.time.Duration;

import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.ProfileCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

@Configuration
@EnableConfigurationProperties(S3Properties.class)
public class S3Config {
	/** 로컬은 이름 있는 AWS 프로필을 사용하고 운영은 환경변수·역할의 기본 인증 체인을 사용합니다. */
	@Bean(destroyMethod = "close")
	@ConditionalOnExpression("!'${moahome.storage.s3.bucket:}'.isEmpty()")
	S3Client profileS3Client(S3Properties properties) {
		AwsCredentialsProvider credentials = properties.profile() != null && !properties.profile().isBlank()
		    ? ProfileCredentialsProvider.builder().profileName(properties.profile()).build()
		    : DefaultCredentialsProvider.builder().build();
		return S3Client.builder().region(Region.of(properties.region())).credentialsProvider(credentials)
		    .overrideConfiguration(configuration -> configuration.apiCallTimeout(Duration.ofSeconds(10))
		        .apiCallAttemptTimeout(Duration.ofSeconds(4)))
		    .build();
	}
}
