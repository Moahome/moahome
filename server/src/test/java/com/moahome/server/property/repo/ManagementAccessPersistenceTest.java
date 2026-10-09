package com.moahome.server.property.repo;

import java.time.OffsetDateTime;
import java.util.UUID;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.membership.repo.PropertyMemberRepository;
import com.moahome.server.property.domain.Property;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.user.domain.User;
import com.moahome.server.user.repo.UserRepository;
import com.moahome.server.user.service.UserService;
import com.moahome.server.user.support.PostgresTestServer;
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
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.assertj.core.api.Assertions.*;

@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(FlywayAutoConfiguration.class)
@Import({ManagementAccessService.class, UserService.class, ManagementAccessPersistenceTest.Beans.class})
@ActiveProfiles("database-test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ManagementAccessPersistenceTest {
	private static final PostgresTestServer POSTGRES = new PostgresTestServer();
	@Autowired UserRepository users;
	@Autowired PropertyRepository properties;
	@Autowired PropertyMemberRepository members;
	@Autowired ManagementAccessService management;
	@Autowired JdbcTemplate jdbc;
	private UUID userId;
	private static final OffsetDateTime AT = OffsetDateTime.parse("2026-10-09T01:00:00Z");

	@DynamicPropertySource
	static void infrastructure(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", POSTGRES::jdbcUrl);
		registry.add("spring.datasource.username", POSTGRES::username);
		registry.add("spring.datasource.password", () -> "");
	}

	@BeforeEach
	void prepare() { userId = users.saveAndFlush(User.create("조회 사용자", null)).getId(); }

	@AfterAll
	static void stopPostgres() { POSTGRES.close(); }

	@Test
	void readsBothManagementRolesWithoutRegistrationResultsAndOrdersByCreationThenUuid() {
		var later = property("나중 대상", AT.plusDays(1));
		var first = property("첫 대상", AT);
		var sameTime = property("같은 시각", AT);
		member(later, userId, "MANAGER");
		member(first, userId, "ADMIN");
		member(sameTime, userId, "ADMIN");
		var expectedTies = java.util.stream.Stream.of(first, sameTime).sorted(java.util.Comparator.comparing(UUID::toString)).toList();
		assertThat(management.getManagedProperties(userId).properties()).extracting(p -> p.propertyId())
			.containsExactly(expectedTies.get(0), expectedTies.get(1), later);
		assertThat(management.getManagementContext(userId, later).role().name()).isEqualTo("MANAGER");
		assertThat(jdbc.queryForObject("select count(*) from property_registration_results", Integer.class)).isZero();
	}

	@Test
	void excludesResidentOtherUserAndEveryInactiveDeletedOrEndedCondition() {
		var valid = property("유효", AT);
		member(valid, userId, "ADMIN");
		var resident = property("주민", AT);
		member(resident, userId, "RESIDENT");
		var other = property("다른 사용자", AT);
		member(other, users.saveAndFlush(User.create("다른 사용자", null)).getId(), "ADMIN");
		for (String condition : java.util.List.of("status = 'INACTIVE'", "ended_at = now()", "deleted_at = now()")) {
			var target = property("종료 참여", AT);
			var membership = member(target, userId, "MANAGER");
			jdbc.update("update property_members set " + condition + " where id = ?", membership);
			assertDenied(target);
		}
		for (String condition : java.util.List.of("status = 'INACTIVE'", "deleted_at = now()")) {
			var target = property("비활성 대상", AT);
			member(target, userId, "ADMIN");
			jdbc.update("update properties set " + condition + " where id = ?", target);
			assertDenied(target);
		}
		assertThat(management.getManagedProperties(userId).properties()).extracting(p -> p.propertyId()).containsExactly(valid);
		assertDenied(resident);
		assertDenied(other);
		assertDenied(UUID.randomUUID());
	}

	@Test
	void rechecksRoleAfterListLookupInsteadOfUsingOldAdminSnapshot() {
		var target = property("권한 변경", AT);
		var membership = member(target, userId, "ADMIN");
		assertThat(management.getManagedProperties(userId).properties()).hasSize(1);
		jdbc.update("update property_members set role = 'RESIDENT' where id = ?", membership);
		assertDenied(target);
		assertThat(management.getManagedProperties(userId).properties()).isEmpty();
		assertThat(members.hasCurrentAccess(userId, target)).isTrue();
	}

	private UUID property(String name, OffsetDateTime at) {
		return properties.saveAndFlush(Property.create(name, "주소", null, null, false, at)).getId();
	}

	private UUID member(UUID propertyId, UUID accountId, String role) {
		UUID id = UUID.randomUUID();
		jdbc.update("""
			insert into property_members (id, property_id, user_id, role, status, joined_at, created_at, updated_at)
			values (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
			""", id, propertyId, accountId, role, AT, AT, AT);
		return id;
	}

	private void assertDenied(UUID target) {
		assertThatThrownBy(() -> management.getManagementContext(userId, target)).isInstanceOfSatisfying(AuthException.class,
			e -> assertThat(e.code()).isEqualTo(AuthErrorCode.ACCESS_DENIED));
	}

	@TestConfiguration
	static class Beans {
		@Bean java.time.Clock clock() { return java.time.Clock.systemUTC(); }
	}
}
