package com.moahome.server.auth.repo;

import java.time.Duration;

import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.support.RedisTestServer;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RedisAuthSessionRepositoryTest {
	@Test
	void unavailableRedisIsReportedAsAuthenticationServiceFailure() {
		int port;
		try (var server = new RedisTestServer()) {
			port = server.port();
		}
		var factory = new LettuceConnectionFactory(new RedisStandaloneConfiguration("127.0.0.1", port),
			LettuceClientConfiguration.builder().commandTimeout(Duration.ofMillis(200))
				.shutdownTimeout(Duration.ZERO).build());
		factory.afterPropertiesSet();
		try {
			var repository = new RedisAuthSessionRepository(new StringRedisTemplate(factory));
			assertThatThrownBy(() -> repository.find("session-1")).isInstanceOfSatisfying(AuthException.class,
				exception -> assertThat(exception.code()).isEqualTo(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE));
		} finally {
			factory.destroy();
		}
	}
}
