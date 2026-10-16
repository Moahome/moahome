package com.moahome.server.user.repo;

import java.time.Clock;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import com.moahome.server.auth.domain.SocialAccount;
import com.moahome.server.auth.domain.SocialProvider;
import com.moahome.server.auth.domain.VerifiedSocialProfile;
import com.moahome.server.auth.repo.SocialAccountRepository;
import com.moahome.server.auth.service.SocialAccountService;
import com.moahome.server.user.domain.SystemRole;
import com.moahome.server.user.domain.User;
import com.moahome.server.user.domain.UserStatus;
import com.moahome.server.user.exception.UserException;
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
@Import({UserService.class, SocialAccountService.class, UserPersistenceTest.TestBeans.class})
@ActiveProfiles("database-test")
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class UserPersistenceTest {
	private static final PostgresTestServer POSTGRES = new PostgresTestServer();
	@Autowired private UserRepository users;
	@Autowired private SocialAccountRepository accounts;
	@Autowired private UserService userService;
	@Autowired private SocialAccountService socialAccounts;
	@Autowired private JdbcTemplate jdbc;
	@Autowired private Flyway flyway;

	@DynamicPropertySource
	static void infrastructure(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", POSTGRES::jdbcUrl);
		registry.add("spring.datasource.username", POSTGRES::username);
		registry.add("spring.datasource.password", () -> "");
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
		assertThat(flyway.info().applied()).hasSize(21);
		assertThat(flyway.migrate().migrationsExecuted).isZero();
		assertThat(users.findById(id)).isPresent();
		User persisted = users.findById(id).orElseThrow();
		assertThat(persisted.getCreatedAt()).isNotNull();
		assertThat(persisted.getUpdatedAt()).isNotNull();
		assertThat(persisted.getLastLoginAt()).isNotNull();
		assertThat(persisted.getSystemRole()).isEqualTo(SystemRole.USER);
		assertThat(phoneColumns("public")).isZero();
	}

	@Test
	void upgradesExistingSchemaAndPreservesUserAndSocialIdentity() {
		String schema = "migration_" + UUID.randomUUID().toString().replace("-", "");
		Flyway original = Flyway.configure()
			.dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
			.schemas(schema).defaultSchema(schema).target("20261003080747").load();
		original.migrate();
		assertThat(phoneColumns(schema)).isEqualTo(4);
		UUID userId = UUID.randomUUID();
		UUID socialId = UUID.randomUUID();
		jdbc.update("insert into " + schema + ".users "
			+ "(id, display_name, status, phone_encrypted, phone_hmac, phone_last4, phone_verified_at) "
			+ "values (?, ?, 'ACTIVE', ?, ?, ?, CURRENT_TIMESTAMP)",
			userId, "기존 사용자", "legacy-encrypted", "a".repeat(64), "5678");
		jdbc.update("insert into " + schema + ".social_accounts (id, user_id, provider, provider_user_id) "
			+ "values (?, ?, 'KAKAO', ?)", socialId, userId, "legacy-identity");
		Flyway upgraded = Flyway.configure()
			.dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
			.schemas(schema).defaultSchema(schema).load();
		assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(20);
		upgraded.validate();
		assertThat(phoneColumns(schema)).isZero();
		assertThat(jdbc.queryForObject("select display_name from " + schema + ".users where id = ?",
			String.class, userId)).isEqualTo("기존 사용자");
		assertThat(jdbc.queryForObject("select status from " + schema + ".users where id = ?",
			String.class, userId)).isEqualTo("ACTIVE");
		assertThat(jdbc.queryForObject("select system_role from " + schema + ".users where id = ?",
			String.class, userId)).isEqualTo("USER");
		assertThat(jdbc.queryForObject("select user_id from " + schema + ".social_accounts "
			+ "where provider = 'KAKAO' and provider_user_id = ?", UUID.class, "legacy-identity"))
			.isEqualTo(userId);
	}

	@Test
	void addsDefaultSystemRoleToExistingAccountsWithoutChangingTheirStatus() {
		String schema = "migration_" + UUID.randomUUID().toString().replace("-", "");
		Flyway previous = Flyway.configure()
			.dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
			.schemas(schema).defaultSchema(schema).target("20261003103819").load();
		previous.migrate();
		UUID activeId = UUID.randomUUID();
		UUID suspendedId = UUID.randomUUID();
		UUID withdrawnId = UUID.randomUUID();
		jdbc.update("insert into " + schema + ".users (id, display_name, status) values (?, ?, 'ACTIVE')",
			activeId, "정상 사용자");
		jdbc.update("insert into " + schema + ".users (id, display_name, status) values (?, ?, 'SUSPENDED')",
			suspendedId, "정지 사용자");
		jdbc.update("insert into " + schema + ".users (id, display_name, status, deleted_at, deleted_by) "
			+ "values (?, ?, 'WITHDRAWN', CURRENT_TIMESTAMP, ?)", withdrawnId, "탈퇴 사용자", activeId);
		Flyway upgraded = Flyway.configure()
			.dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
			.schemas(schema).defaultSchema(schema).load();
		assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(19);
		upgraded.validate();
		for (UUID id : new UUID[]{activeId, suspendedId, withdrawnId}) {
			assertThat(jdbc.queryForObject("select system_role from " + schema + ".users where id = ?",
				String.class, id)).isEqualTo("USER");
		}
		assertThat(jdbc.queryForObject("select status from " + schema + ".users where id = ?",
			String.class, suspendedId)).isEqualTo("SUSPENDED");
		assertThat(jdbc.queryForObject("select deleted_by from " + schema + ".users where id = ?",
			UUID.class, withdrawnId)).isEqualTo(activeId);
		assertThat(jdbc.queryForObject("select status from " + schema + ".users where id = ?",
			String.class, withdrawnId)).isEqualTo("WITHDRAWN");
	}

	@Test
	void persistsSystemRolesAndRejectsInvalidDatabaseValues() {
		UUID id = socialAccounts.resolveVerifiedUser(profile("platform-admin", null));
		assertThat(users.findById(id).orElseThrow().getSystemRole()).isEqualTo(SystemRole.USER);
		jdbc.update("update users set system_role = 'ADMIN' where id = ?", id);
		assertThat(users.findById(id).orElseThrow().getSystemRole()).isEqualTo(SystemRole.ADMIN);
		assertThat(socialAccounts.resolveVerifiedUser(profile("platform-admin", null))).isEqualTo(id);
		assertThat(users.findById(id).orElseThrow().getSystemRole()).isEqualTo(SystemRole.ADMIN);
		assertThatThrownBy(() -> jdbc.update("update users set system_role = 'MANAGER' where id = ?", id))
			.isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> jdbc.update("update users set system_role = null where id = ?", id))
			.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void databaseRejectsDuplicateActiveSocialIdentityAndInvalidWithdrawalState() {
		UUID id = socialAccounts.resolveVerifiedUser(profile("123", null));
		User other = users.saveAndFlush(User.create("다른 사용자", null));
		assertThatThrownBy(() -> accounts.saveAndFlush(SocialAccount.link(other, profile("123", null))))
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
		jdbc.update("update users set system_role = 'ADMIN' where id = ?", oldId);
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
		assertThat(users.findById(newId).orElseThrow().getSystemRole()).isEqualTo(SystemRole.USER);
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

	private int phoneColumns(String schema) {
		return jdbc.queryForObject("select count(*) from information_schema.columns "
			+ "where table_schema = ? and table_name = 'users' and column_name like 'phone_%'",
			Integer.class, schema);
	}

	@TestConfiguration
	static class TestBeans {
		@Bean
		Clock clock() {
			return Clock.systemUTC();
		}
	}
}
