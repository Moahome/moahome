package com.moahome.server.membership.repo;

import java.time.*;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.moahome.server.auth.support.RedisTestServer;
import com.moahome.server.payment.exception.PaymentException;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class RedisInvitationCodeRepositoryTest {
	/** 실제 연결 불가를 코드 유실과 구분하고 DB 해시 인증으로 우회하지 않습니다. */
	@Test
	void disconnectedRedisReturnsRetryableServiceFailure() {
		int port;
		try (var server = new RedisTestServer()) { port = server.port(); }
		var factory = new LettuceConnectionFactory(new RedisStandaloneConfiguration("127.0.0.1", port),
		    LettuceClientConfiguration.builder().commandTimeout(Duration.ofMillis(200)).shutdownTimeout(Duration.ZERO).build());
		factory.afterPropertiesSet();
		try {
			var repository = new RedisInvitationCodeRepository(new StringRedisTemplate(factory), Clock.systemUTC());
			assertThatThrownBy(() -> repository.require(RedisInvitationCodeRepository.Kind.RESIDENT, UUID.randomUUID(),
			    UUID.randomUUID(), "a".repeat(64), OffsetDateTime.now().plusMinutes(30)))
			    .isInstanceOfSatisfying(PaymentException.class, error -> assertThat(error.code()).isEqualTo("INVITATION_SERVICE_UNAVAILABLE"));
		} finally { factory.destroy(); }
	}

	/** 커밋 후 정리 장애는 이미 성공한 업무 결과를 실패로 바꾸지 않으며 롤백 때는 코드를 지우지 않습니다. */
	@Test
	void deletionWaitsForCommitAndDoesNotTurnCleanupFailureIntoBusinessFailure() {
		var redis = mock(StringRedisTemplate.class);
		var repository = new RedisInvitationCodeRepository(redis, Clock.systemUTC());
		UUID id = UUID.randomUUID();
		TransactionSynchronizationManager.setActualTransactionActive(true);
		TransactionSynchronizationManager.initSynchronization();
		try {
			repository.deleteAfterCommit(RedisInvitationCodeRepository.Kind.RESIDENT, id);
			verifyNoInteractions(redis);
			var callback = TransactionSynchronizationManager.getSynchronizations().getFirst();
			callback.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
			verifyNoInteractions(redis);
			when(redis.delete(anyString())).thenThrow(new DataAccessResourceFailureException("test"));
			assertThatCode(callback::afterCommit).doesNotThrowAnyException();
			verify(redis).delete("membership:invitation:resident:" + id);
		} finally {
			TransactionSynchronizationManager.clearSynchronization();
			TransactionSynchronizationManager.setActualTransactionActive(false);
		}
	}
}
