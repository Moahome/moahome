package com.moahome.server.user.repo;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import com.moahome.server.auth.domain.SocialAccount;
import com.moahome.server.auth.domain.SocialProvider;
import com.moahome.server.auth.domain.VerifiedSocialProfile;
import com.moahome.server.auth.repo.SocialAccountRepository;
import com.moahome.server.auth.service.SocialAccountService;
import com.moahome.server.user.domain.User;
import com.moahome.server.user.domain.UserStatus;
import com.moahome.server.user.exception.UserException;
import com.moahome.server.user.security.PhoneSecurity;
import com.moahome.server.user.service.UserService;
import com.moahome.server.user.support.PostgresTestServer;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(FlywayAutoConfiguration.class)
@Import({UserService.class, SocialAccountService.class, PhoneSecurity.class, UserPersistenceTest.TestBeans.class})
@ActiveProfiles("database-test")
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class UserPersistenceTest {
	private static final PostgresTestServer POSTGRES = new PostgresTestServer();
	@Autowired private UserRepository users;
	@Autowired private SocialAccountRepository accounts;
	@Autowired private UserService userService;
	@Autowired private SocialAccountService socialAccounts;
	@Autowired private PhoneSecurity phones;
	@Autowired private JdbcTemplate jdbc;
	@Autowired private Flyway flyway;

	@DynamicPropertySource
	static void infrastructure(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", POSTGRES::jdbcUrl);
		registry.add("spring.datasource.username", POSTGRES::username);
		registry.add("spring.datasource.password", () -> "");
		registry.add("moahome.phone-security.encryption-keys.v1", UserPersistenceTest::randomKey);
		registry.add("moahome.phone-security.hmac-key-base64", UserPersistenceTest::randomKey);
	}

	@AfterEach
	void cleanRows() {
		jdbc.update("delete from social_accounts");
		jdbc.update("delete from users");
	}

	@AfterAll
	static void stopPostgres() {
		POSTGRES.close();
	}

	@Test
	void migratesEmptyDatabaseAndRevalidatesExistingSchemaWithoutLosingData() {
		UUID id = socialAccounts.resolveVerifiedUser(profile("123", null));
		flyway.validate();
		assertThat(flyway.info().applied()).hasSize(1);
		assertThat(flyway.migrate().migrationsExecuted).isZero();
		assertThat(users.findById(id)).isPresent();
		User persisted = users.findById(id).orElseThrow();
		assertThat(persisted.getCreatedAt()).isNotNull();
		assertThat(persisted.getUpdatedAt()).isNotNull();
		assertThat(persisted.getLastLoginAt()).isNotNull();
		assertThat(persisted.getPhoneEncrypted()).isNull();
	}

	@Test
	void persistsEncryptedPhoneAndFindsEquivalentNumberWithoutUniquenessPolicy() {
		UUID first = socialAccounts.resolveVerifiedUser(profile("123", null));
		UUID second = socialAccounts.resolveVerifiedUser(profile("456", null));
		OffsetDateTime verifiedAt = OffsetDateTime.parse("2026-10-03T08:00:00+09:00");
		userService.verifyPhone(first, "+82 10-1234-5678", verifiedAt);
		userService.verifyPhone(second, "+821012345678", verifiedAt);
		User user = users.findById(first).orElseThrow();
		assertThat(user.getPhoneEncrypted()).doesNotContain("12345678");
		assertThat(phones.decrypt(user.getPhoneEncrypted())).isEqualTo("+821012345678");
		assertThat(user.getPhoneHmac()).isEqualTo(phones.hmac("+821012345678"));
		assertThat(user.getPhoneLast4()).isEqualTo("5678");
		assertThat(user.getPhoneVerifiedAt().toInstant()).isEqualTo(verifiedAt.toInstant());
		assertThat(userService.findByPhone("+82 (10) 1234-5678")).extracting(User::getId)
			.containsExactlyInAnyOrder(first, second);
		assertThat(jdbc.queryForObject("select phone_encrypted from users where id = ?", String.class, first))
			.isEqualTo(user.getPhoneEncrypted());
	}

	@Test
	void databaseRejectsDuplicateActiveSocialIdentityAndPartialPhoneData() {
		UUID id = socialAccounts.resolveVerifiedUser(profile("123", null));
		User other = users.saveAndFlush(User.create("다른 사용자", null));
		assertThatThrownBy(() -> accounts.saveAndFlush(SocialAccount.link(other, profile("123", null))))
			.isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> jdbc.update("update users set phone_last4 = '1234' where id = ?", id))
			.isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> jdbc.update("update users set status = 'WITHDRAWN' where id = ?", id))
			.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void loginUsesProviderIdentityAndDoesNotMergeEqualEmails() {
		UUID first = socialAccounts.resolveVerifiedUser(profile("123", "same@example.test"));
		UUID second = socialAccounts.resolveVerifiedUser(profile("456", "same@example.test"));
		assertThat(first).isNotEqualTo(second);
		assertThat(socialAccounts.resolveVerifiedUser(profile("123", null))).isEqualTo(first);
		assertThat(accounts.findActiveIdentity(SocialProvider.KAKAO, "123").orElseThrow().getProviderEmail()).isNull();
		assertThat(users.count()).isEqualTo(2);
	}

	@Test
	void withdrawalDeletesSocialLinkAndRejoinCreatesNewUserWithoutRestoringHistory() {
		UUID oldId = socialAccounts.resolveVerifiedUser(profile("123", null));
		UUID oldSocialId = accounts.findActiveIdentity(SocialProvider.KAKAO, "123").orElseThrow().getId();
		socialAccounts.withdrawUser(oldId, oldId);
		assertThat(users.findByIdAndDeletedAtIsNull(oldId)).isEmpty();
		assertThat(users.findById(oldId).orElseThrow().getStatus()).isEqualTo(UserStatus.WITHDRAWN);
		assertThat(accounts.findActiveIdentity(SocialProvider.KAKAO, "123")).isEmpty();
		UUID newId = socialAccounts.resolveVerifiedUser(profile("123", null));
		assertThat(newId).isNotEqualTo(oldId);
		assertThat(accounts.findById(oldSocialId).orElseThrow().getDeletedBy()).isEqualTo(oldId);
		assertThat(accounts.findActiveIdentity(SocialProvider.KAKAO, "123").orElseThrow().getUser().getId()).isEqualTo(newId);
		assertThat(users.count()).isEqualTo(2);
	}

	@Test
	void suspensionBlocksLoginAndWithdrawalFailureRollsBackUserAndSocialChanges() {
		UUID id = socialAccounts.resolveVerifiedUser(profile("123", null));
		userService.suspend(id);
		assertThatThrownBy(() -> socialAccounts.resolveVerifiedUser(profile("123", "new@example.test")))
			.isInstanceOf(UserException.class);
		assertThat(accounts.findActiveIdentity(SocialProvider.KAKAO, "123").orElseThrow().getProviderEmail()).isNull();
		userService.resume(id);
		assertThatThrownBy(() -> socialAccounts.withdrawUser(id, UUID.randomUUID()))
			.isInstanceOf(DataIntegrityViolationException.class);
		assertThat(userService.requireActive(id).getStatus()).isEqualTo(UserStatus.ACTIVE);
		assertThat(accounts.findActiveIdentity(SocialProvider.KAKAO, "123")).isPresent();
	}

	@Test
	void concurrentFirstLoginsCreateOnlyOneUserAndOneSocialAccount() throws Exception {
		CountDownLatch ready = new CountDownLatch(2);
		CountDownLatch start = new CountDownLatch(1);
		java.util.concurrent.Callable<UUID> task = () -> {
			ready.countDown();
			if (!start.await(5, TimeUnit.SECONDS)) {
				throw new IllegalStateException("Concurrent login start timed out");
			}
			return socialAccounts.resolveVerifiedUser(profile("concurrent", null));
		};
		try (var executor = Executors.newFixedThreadPool(2)) {
			var first = executor.submit(task);
			var second = executor.submit(task);
			assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
			start.countDown();
			assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo(second.get(10, TimeUnit.SECONDS));
		}
		assertThat(users.count()).isEqualTo(1);
		assertThat(accounts.count()).isEqualTo(1);
	}

	private VerifiedSocialProfile profile(String providerUserId, String email) {
		return new VerifiedSocialProfile(SocialProvider.KAKAO, providerUserId, email, "사용자", null);
	}

	private static String randomKey() {
		byte[] bytes = new byte[32];
		new SecureRandom().nextBytes(bytes);
		return Base64.getEncoder().encodeToString(bytes);
	}

	@TestConfiguration
	static class TestBeans {
		@Bean
		Clock clock() {
			return Clock.systemUTC();
		}
	}
}
