package com.moahome.server.property.repo;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import jakarta.persistence.EntityManager;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.billing.service.BillingGenerationService;
import com.moahome.server.membership.repo.PropertyMemberRepository;
import com.moahome.server.property.domain.Building;
import com.moahome.server.property.domain.Property;
import com.moahome.server.property.dto.BuildingRequest;
import com.moahome.server.property.dto.UnitBatchRequest;
import com.moahome.server.property.dto.UnitRequest;
import com.moahome.server.property.dto.UnitResponse;
import com.moahome.server.property.exception.UnitManagementException;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.property.service.UnitManagementService;
import com.moahome.server.resident.service.ResidentListService;
import com.moahome.server.resident.service.ResidentManagementService;
import com.moahome.server.user.domain.User;
import com.moahome.server.user.exception.UserException;
import com.moahome.server.user.repo.UserRepository;
import com.moahome.server.user.service.UserService;
import com.moahome.server.user.support.PostgresTestServer;

import static org.assertj.core.api.Assertions.*;

@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(FlywayAutoConfiguration.class)
@Import({ResidentListService.class, ManagementAccessService.class,
        UserService.class, UnitManagementService.class,
        ManagementAccessPersistenceTest.Beans.class})
@ActiveProfiles("database-test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ManagementAccessPersistenceTest {
	private static final PostgresTestServer POSTGRES = new PostgresTestServer();

	@MockitoBean
	BillingGenerationService billing;

	@MockitoBean
	ResidentManagementService residentManagement;

	@Autowired
	UserRepository users;

	@Autowired
	PropertyRepository properties;

	@Autowired
	PropertyMemberRepository members;

	@Autowired
	ManagementAccessService management;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	UnitManagementService unitManagement;

	@Autowired
	BuildingRepository buildings;

	@Autowired
	UnitRepository units;

	@Autowired
	EntityManager entityManager;

	private UUID userId;

	private static final OffsetDateTime AT = OffsetDateTime.parse("2026-10-09T01:00:00Z");

	@DynamicPropertySource
	static void infrastructure(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", POSTGRES::jdbcUrl);
		registry.add("spring.datasource.username", POSTGRES::username);
		registry.add("spring.datasource.password", () -> "");
	}

	@BeforeEach
	void prepare() {
		userId = users.saveAndFlush(User.create("조회 사용자", null)).getId();
	}

	@AfterAll
	static void stopPostgres() {
		POSTGRES.close();
	}

	@Test
	void readsBothManagementRolesWithoutRegistrationResultsAndOrdersByCreationThenUuid() {
		var later = property("나중 대상", AT.plusDays(1));
		var first = property("첫 대상", AT);
		var sameTime = property("같은 시각", AT);
		member(later, userId, "MANAGER");
		member(first, userId, "ADMIN");
		member(sameTime, userId, "ADMIN");
		List<UUID> expectedTies = Stream.of(first, sameTime)
		    .sorted(Comparator.comparing(UUID::toString)).toList();
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
		for (String condition : List.of("status = 'INACTIVE'", "ended_at = now()", "deleted_at = now()")) {
			var target = property("종료 참여", AT);
			var membership = member(target, userId, "MANAGER");
			jdbc.update("update property_members set " + condition + " where id = ?", membership);
			assertDenied(target);
		}
		for (String condition : List.of("status = 'INACTIVE'", "deleted_at = now()")) {
			var target = property("비활성 대상", AT);
			member(target, userId, "ADMIN");
			jdbc.update("update properties set " + condition + " where id = ?", target);
			assertDenied(target);
		}
		assertThat(management.getManagedProperties(userId).properties()).extracting(p -> p.propertyId())
		    .containsExactly(valid);
		assertDenied(resident);
		assertDenied(other);
		assertDenied(UUID.randomUUID());
	}

	@Test
	void residentHomeListsOnlyOwnActiveResidentMembershipAndNeverGrantsManagementContext() {
		UUID resident = property("내 주민 참여", AT);
		member(resident, userId, "RESIDENT");
		UUID admin = property("관리 권한", AT);
		member(admin, userId, "ADMIN");
		UUID other = property("다른 주민", AT);
		member(other, users.saveAndFlush(User.create("다른 주민", null)).getId(), "RESIDENT");
		for (String condition : List.of("status='INACTIVE'", "ended_at=now()", "deleted_at=now()")) {
			UUID target = property("종료 주민 참여", AT);
			UUID membership = member(target, userId, "RESIDENT");
			jdbc.update("update property_members set " + condition + " where id=?", membership);
		}
		for (String condition : List.of("status='INACTIVE'", "deleted_at=now()")) {
			UUID target = property("종료 대상", AT);
			member(target, userId, "RESIDENT");
			jdbc.update("update properties set " + condition + " where id=?", target);
		}
		assertThat(management.getResidentProperties(userId).properties()).extracting(p -> p.propertyId())
		    .containsExactly(resident);
		assertThat(management.getManagedProperties(userId).properties()).extracting(p -> p.propertyId())
		    .containsExactly(admin);
		assertDenied(resident);
	}

	@Test
	void unitManagementReadsStoredUnitsAndPersistsUpdatesWithTheSameIdentity() {
		var target = properties.saveAndFlush(Property.create("세대 관리", "주소", null, null, true, AT));
		member(target.getId(), userId, "ADMIN");
		var building = buildings
		    .saveAndFlush(Building.create(target, "101동", 0, AT));
		var second = buildings.saveAndFlush(Building.create(target, "102동", 1, AT));
		var created = unitManagement.create(userId, target.getId(),
		    new UnitRequest(building.getId(), "001", null, -1, "ACTIVE"));
		unitManagement.create(userId, target.getId(),
		    new UnitRequest(second.getId(), "001", null, null, "VACANT"));
		var before = unitManagement.list(userId, target.getId());
		assertThat(before.hasBuildings()).isTrue();
		assertThat(before.buildings()).hasSize(2);
		assertThat(before.units()).hasSize(2);
		unitManagement.update(userId, target.getId(), created.id(),
		    new UnitRequest(second.getId(), "B101", "지하", -1, "VACANT"));
		entityManager.clear();
		var stored = units.findById(created.id()).orElseThrow();
		assertThat(stored.getUnitNumber()).isEqualTo("B101");
		assertThat(stored.getBuildingId()).isEqualTo(second.getId());
		assertThat(stored.getStatus().name()).isEqualTo("VACANT");
		assertThat(unitManagement.list(userId, target.getId()).units()).hasSize(2);
		assertThatThrownBy(() -> unitManagement.create(userId, target.getId(),
		    new UnitRequest(second.getId(), "001", null, null, "ACTIVE")))
		    .isInstanceOfSatisfying(UnitManagementException.class,
		        error -> assertThat(error.code().name()).isEqualTo("DUPLICATE_UNIT"));
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

	@Test
	void buildingManagementAndBatchPersistInExistingSchemaWithoutChangingUnitLinks() {
		var target = properties.saveAndFlush(Property.create("일괄 관리", "주소", null, null, true, AT));
		member(target.getId(), userId, "ADMIN");
		var building = unitManagement.createBuilding(userId, target.getId(),
		    new BuildingRequest("101"));
		List<UnitResponse> created = unitManagement.createBatch(userId, target.getId(),
		    new UnitBatchRequest(List.of(
		        new UnitRequest(building.id(), "201", null, 2, "ACTIVE"),
		        new UnitRequest(building.id(), "202", "별채", 2, "VACANT"))));
		unitManagement.updateBuilding(userId, target.getId(), building.id(),
		    new BuildingRequest("A"));
		entityManager.clear();
		assertThat(created).hasSize(2);
		assertThat(buildings.findById(building.id()).orElseThrow().getName()).isEqualTo("A동");
		assertThat(units.findByPropertyId(target.getId())).extracting(unit -> unit.getBuildingId())
		    .containsOnly(building.id());
		assertThat(unitManagement.list(userId, target.getId()).units()).extracting(unit -> unit.id())
		    .containsExactlyInAnyOrderElementsOf(created.stream().map(unit -> unit.id()).toList());
	}

	@Test
	void softDeletionPersistsAuditFieldsAndExcludesOnlyTheSelectedBuildingAndUnits() {
		var target = properties.saveAndFlush(Property.create("삭제 검증", "주소", null, null, true, AT));
		member(target.getId(), userId, "ADMIN");
		var first = unitManagement.createBuilding(userId, target.getId(),
		    new BuildingRequest("101"));
		var second = unitManagement.createBuilding(userId, target.getId(),
		    new BuildingRequest("102"));
		var selected = unitManagement.create(userId, target.getId(),
		    new UnitRequest(first.id(), "201", "별칭", 2, "ACTIVE"));
		var connected = unitManagement.create(userId, target.getId(),
		    new UnitRequest(first.id(), "202", null, 2, "VACANT"));
		var retained = unitManagement.create(userId, target.getId(),
		    new UnitRequest(second.id(), "201", null, 2, "ACTIVE"));
		unitManagement.deleteUnits(userId, target.getId(), List.of(selected.id()));
		entityManager.clear();
		var deleted = units.findById(selected.id()).orElseThrow();
		var deletedAt = deleted.getDeletedAt();
		assertThat(deleted.getDeletedBy()).isEqualTo(userId);
		assertThat(deletedAt).isNotNull();
		assertThat(deleted.getDisplayName()).isEqualTo("별칭");
		assertThat(unitManagement.list(userId, target.getId()).units()).hasSize(2);
		unitManagement.deleteUnits(userId, target.getId(), List.of(selected.id()));
		unitManagement.deleteBuilding(userId, target.getId(), first.id());
		unitManagement.deleteBuilding(userId, target.getId(), first.id());
		entityManager.clear();
		var removedBuilding = buildings.findById(first.id()).orElseThrow();
		assertThat(removedBuilding.getDeletedBy()).isEqualTo(userId);
		assertThat(units.findById(connected.id()).orElseThrow().getDeletedAt())
		    .isEqualTo(removedBuilding.getDeletedAt());
		assertThat(units.findById(selected.id()).orElseThrow().getDeletedAt()).isEqualTo(deletedAt);
		assertThat(unitManagement.list(userId, target.getId()).buildings()).extracting(item -> item.id())
		    .containsExactly(second.id());
		assertThat(unitManagement.list(userId, target.getId()).units()).extracting(item -> item.id())
		    .containsExactly(retained.id());
		assertThat(units.findByPropertyId(target.getId())).hasSize(3);
		assertThatThrownBy(() -> unitManagement.deleteBuilding(userId, target.getId(), second.id()))
		    .isInstanceOfSatisfying(UnitManagementException.class,
		        error -> assertThat(error.code().name()).isEqualTo("LAST_BUILDING_NOT_DELETABLE"));
		entityManager.clear();
		assertThat(buildings.findById(second.id()).orElseThrow().getDeletedAt()).isNull();
		assertThat(units.findById(retained.id()).orElseThrow().getDeletedAt()).isNull();
	}

	@Test
	void propertyAccessKeepsRolesScopedAndRechecksTerminationAndConflicts() {
		UUID first = property("관리 대상", AT), second = property("주민 대상", AT);
		member(first, userId, "MANAGER");
		UUID membership = member(second, userId, "RESIDENT");
		assertThat(management.getPropertyAccessContext(userId, first).role().name()).isEqualTo("MANAGER");
		var resident = management.getPropertyAccessContext(userId, second);
		assertThat(resident.role().name()).isEqualTo("RESIDENT");
		assertThat(resident.residentEligible()).isFalse();
		assertThatThrownBy(() -> management.getPropertyAccessContext(UUID.randomUUID(), first))
		    .isInstanceOf(UserException.class);
		jdbc.update("update property_members set role='MANAGER' where id=?", membership);
		assertThat(management.getPropertyAccessContext(userId, second).role().name()).isEqualTo("MANAGER");
		member(second, userId, "RESIDENT");
		assertThatThrownBy(() -> management.getPropertyAccessContext(userId, second)).isInstanceOf(IllegalStateException.class);
		jdbc.update("update property_members set ended_at=now() where property_id=?", second);
		assertThatThrownBy(() -> management.getPropertyAccessContext(userId, second)).isInstanceOf(AuthException.class);
		jdbc.update("update properties set deleted_at=now() where id=?", first);
		assertThatThrownBy(() -> management.getPropertyAccessContext(userId, first)).isInstanceOf(AuthException.class);
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
		assertThatThrownBy(() -> management.getManagementContext(userId, target)).isInstanceOfSatisfying(
		    AuthException.class, e -> assertThat(e.code()).isEqualTo(AuthErrorCode.ACCESS_DENIED));
	}

	@TestConfiguration
	static class Beans {
		@Bean
		Clock clock() {
			return Clock.systemUTC();
		}
	}
}
