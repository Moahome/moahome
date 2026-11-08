package com.moahome.server.user.repo;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.UUID;

import com.moahome.server.auth.domain.SocialProvider;
import com.moahome.server.auth.domain.VerifiedSocialProfile;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.repo.SocialAccountRepository;
import com.moahome.server.auth.service.SocialAccountService;
import com.moahome.server.auth.support.MutableClock;
import com.moahome.server.membership.domain.PropertyMember;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.membership.domain.PropertyMemberStatus;
import com.moahome.server.membership.repo.PropertyMemberRepository;
import com.moahome.server.property.domain.Property;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.resident.domain.Resident;
import com.moahome.server.resident.repo.ResidentRepository;
import com.moahome.server.user.domain.UserStatus;
import com.moahome.server.user.exception.AccountLifecycleException;
import com.moahome.server.user.exception.UserException;
import com.moahome.server.user.service.AccountLifecycleService;
import com.moahome.server.user.service.ProfileImageStorage;
import com.moahome.server.user.service.UserService;
import com.moahome.server.user.support.PostgresTestServer;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(FlywayAutoConfiguration.class)
@Import({ UserService.class, SocialAccountService.class, AccountLifecycleService.class,
        AccountLifecyclePersistenceTest.Beans.class })
@ActiveProfiles("database-test")
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AccountLifecyclePersistenceTest {
	private static final PostgresTestServer POSTGRES = new PostgresTestServer();
	@Autowired UserRepository users;
	@Autowired SocialAccountRepository identities;
	@Autowired PropertyRepository properties;
	@Autowired PropertyMemberRepository members;
	@Autowired ResidentRepository residents;
	@Autowired SocialAccountService social;
	@Autowired UserService userService;
	@Autowired AccountLifecycleService lifecycle;
	@Autowired MutableClock clock;
	@Autowired JdbcTemplate jdbc;
	@MockitoBean ProfileImageStorage images;

	@DynamicPropertySource
	static void database(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", POSTGRES::jdbcUrl);
		registry.add("spring.datasource.username", POSTGRES::username);
		registry.add("spring.datasource.password", () -> "");
	}

	@AfterAll
	static void stop() {
		POSTGRES.close();
	}

	@BeforeEach
	void resetTime() {
		clock.set(Instant.parse("2026-11-08T05:00:00Z"));
	}

	@Test
	void requestRetainsIdentityAndRecoveryKeepsCurrentPermissionsWithoutRevivingOldSessions() {
		VerifiedSocialProfile profile = profile();
		UUID id = social.resolveVerifiedUser(profile);
		Property property = property();
		PropertyMember member = members.saveAndFlush(PropertyMember.invited(property.getId(),
		    userService.requireActive(id), PropertyMemberRole.RESIDENT, OffsetDateTime.now(clock)));
		var receipt = lifecycle.request(id);
		assertThat(Duration.between(receipt.requestedAt(), receipt.recoverableUntil())).isEqualTo(Duration.ofDays(30));
		assertThat(users.findById(id).orElseThrow().getStatus()).isEqualTo(UserStatus.WITHDRAWAL_PENDING);
		assertThat(users.findById(id).orElseThrow().getDisplayName()).isEqualTo("계정 이름");
		assertThat(identities.findActiveIdentity(SocialProvider.KAKAO, profile.providerUserId())).isPresent();
		assertThat(social.resolveVerifiedUser(profile)).isEqualTo(id);
		assertThatThrownBy(() -> userService.requireActive(id)).isInstanceOf(UserException.class);
		// 유예 중 다른 관리자가 종료한 참여는 복구로 되살리지 않습니다.
		jdbc.update("update property_members set status='INACTIVE', ended_at=CURRENT_TIMESTAMP where id=?", member.getId());
		clock.advance(Duration.ofDays(30).minusNanos(1_000));
		assertThat(lifecycle.recovery(id, "nonce").state()).isEqualTo("PENDING");
		lifecycle.recover(id);
		assertThat(users.findById(id).orElseThrow().getStatus()).isEqualTo(UserStatus.ACTIVE);
		assertThat(users.findById(id).orElseThrow().getProfileImageUrl()).isEqualTo(profile.profileImageUrl());
		assertThat(users.findById(id).orElseThrow().getAuthVersion()).isEqualTo(1);
		assertThatThrownBy(() -> userService.verifyAuthenticationVersion(id, 0)).isInstanceOf(AuthException.class);
		userService.verifyAuthenticationVersion(id, 1);
		assertThat(members.findById(member.getId()).orElseThrow().getStatus()).isEqualTo(PropertyMemberStatus.INACTIVE);
		clock.advance(Duration.ofDays(2));
		lifecycle.finalizeExpired(id);
		assertThat(users.findById(id).orElseThrow().getStatus()).isEqualTo(UserStatus.ACTIVE);
		verifyNoInteractions(images);
	}

	@Test
	void expiredAccountsRetryS3FailureThenEraseProfileAndSocialDataWhileKeepingSharedRecords() {
		VerifiedSocialProfile profile = profile();
		UUID id = social.resolveVerifiedUser(profile);
		String reference = "/api/users/me/profile-image?v=" + UUID.randomUUID();
		userService.saveProfile(id, "계정 이름", reference, true);
		Property property = property();
		PropertyMember member = members.saveAndFlush(PropertyMember.invited(property.getId(),
		    userService.requireActive(id), PropertyMemberRole.RESIDENT, OffsetDateTime.now(clock)));
		Resident resident = residents.saveAndFlush(Resident.register(UUID.randomUUID(), property.getId(),
		    "공동 관리 명부", null, null, null, OffsetDateTime.now(clock)));
		UUID socialId = identities.findActiveIdentity(SocialProvider.KAKAO, profile.providerUserId()).orElseThrow().getId();
		lifecycle.request(id);
		clock.advance(Duration.ofDays(30));
		assertThat(lifecycle.expired()).contains(id);
		assertThatThrownBy(() -> lifecycle.recover(id)).isInstanceOf(AuthException.class);
		assertThatThrownBy(() -> social.resolveVerifiedUser(profile)).isInstanceOf(AuthException.class);
		doThrow(new IllegalStateException("storage unavailable")).doNothing().when(images).deleteForAccountWithdrawal(id, reference);
		assertThatThrownBy(() -> lifecycle.finalizeExpired(id)).isInstanceOf(IllegalStateException.class);
		assertThat(users.findById(id).orElseThrow().getProfileImageUrl()).isEqualTo(reference);
		assertThat(identities.findActiveIdentity(SocialProvider.KAKAO, profile.providerUserId())).isPresent();
		lifecycle.finalizeExpired(id);
		var erased = users.findById(id).orElseThrow();
		assertThat(erased.getStatus()).isEqualTo(UserStatus.WITHDRAWN);
		assertThat(erased.getDisplayName()).isEqualTo("탈퇴한 사용자");
		assertThat(erased.getProfileImageUrl()).isNull();
		var identity = identities.findById(socialId).orElseThrow();
		assertThat(identity.getProviderEmail()).isNull();
		assertThat(identity.getProviderUserId()).startsWith("withdrawn:").doesNotContain(profile.providerUserId());
		assertThat(identity.getDeletedAt()).isNotNull();
		assertThat(residents.findById(resident.getId()).orElseThrow().getName()).isEqualTo("공동 관리 명부");
		assertThat(properties.findById(property.getId())).isPresent();
		assertThat(members.findById(member.getId()).orElseThrow().getStatus()).isEqualTo(PropertyMemberStatus.INACTIVE);
		verify(images, times(2)).deleteForAccountWithdrawal(id, reference);
		UUID rejoined = social.resolveVerifiedUser(profile);
		assertThat(rejoined).isNotEqualTo(id);
		assertThat(members.findCurrentPropertyIds(rejoined)).isEmpty();
	}

	@Test
	void activeChiefMustHandOverBeforeRequestAndFailedRequestChangesNothing() {
		UUID id = social.resolveVerifiedUser(profile());
		Property property = property();
		members.saveAndFlush(PropertyMember.creator(property, userService.requireActive(id), OffsetDateTime.now(clock)));
		assertThat(lifecycle.status(id).canWithdraw()).isFalse();
		assertThatThrownBy(() -> lifecycle.request(id)).isInstanceOf(AccountLifecycleException.class);
		assertThat(users.findById(id).orElseThrow().getStatus()).isEqualTo(UserStatus.ACTIVE);
		assertThat(users.findById(id).orElseThrow().getAuthVersion()).isZero();
	}

	@Test
	void upgradesExistingAccountsWithoutInvalidatingTheirSessionsOrStartingWithdrawal() {
		String schema = "grace_" + UUID.randomUUID().toString().replace("-", "");
		Flyway original = Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "").schemas(schema)
		    .defaultSchema(schema).target("20261107094145").load();
		original.migrate();
		UUID id = UUID.randomUUID();
		jdbc.update("insert into " + schema + ".users(id, display_name, status) values (?, '기존 계정', 'ACTIVE')", id);
		Flyway upgrade = Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "").schemas(schema)
		    .defaultSchema(schema).load();
		upgrade.migrate();
		upgrade.validate();
		assertThat(jdbc.queryForObject("select auth_version from " + schema + ".users where id=?", Long.class, id)).isZero();
		assertThat(jdbc.queryForObject("select status from " + schema + ".users where id=?", String.class, id)).isEqualTo("ACTIVE");
		assertThat(jdbc.queryForObject("select withdrawal_expires_at is null from " + schema + ".users where id=?", Boolean.class, id)).isTrue();
		assertThatThrownBy(() -> jdbc.update("update " + schema + ".users set status='WITHDRAWAL_PENDING' where id=?", id))
		    .isInstanceOf(DataIntegrityViolationException.class);
	}

	private VerifiedSocialProfile profile() {
		return new VerifiedSocialProfile(SocialProvider.KAKAO, "synthetic-" + UUID.randomUUID(),
		    "test@example.test", "계정 이름", "https://example.test/profile.png");
	}

	private Property property() {
		return properties.saveAndFlush(Property.create("테스트 빌라", "테스트 주소", null, "VILLA", false, OffsetDateTime.now(clock)));
	}

	@TestConfiguration
	static class Beans {
		@Bean
		MutableClock clock() {
			return new MutableClock(Instant.parse("2026-11-08T05:00:00Z"));
		}
	}
}
