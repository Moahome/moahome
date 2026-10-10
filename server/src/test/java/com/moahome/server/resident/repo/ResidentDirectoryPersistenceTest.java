package com.moahome.server.resident.repo;

import java.time.OffsetDateTime;
import java.util.*;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.repo.*;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.resident.service.ResidentListService;
import com.moahome.server.resident.domain.ResidentSignupStatus;
import com.moahome.server.user.domain.User;
import com.moahome.server.user.repo.UserRepository;
import com.moahome.server.user.service.UserService;
import com.moahome.server.user.support.PostgresTestServer;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
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
import org.springframework.test.context.*;
import org.springframework.transaction.annotation.*;
import static org.assertj.core.api.Assertions.*;

@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(FlywayAutoConfiguration.class)
@Import({ResidentListService.class, ManagementAccessService.class, UserService.class, ResidentDirectoryPersistenceTest.Beans.class})
@ActiveProfiles("database-test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class ResidentDirectoryPersistenceTest {
	private static final PostgresTestServer POSTGRES = new PostgresTestServer();
	private static final OffsetDateTime AT = OffsetDateTime.parse("2026-10-10T04:00:00Z");
	@Autowired PropertyRepository properties;
	@Autowired BuildingRepository buildings;
	@Autowired UnitRepository units;
	@Autowired UserRepository users;
	@Autowired ResidentListService service;
	@Autowired JdbcTemplate jdbc;
	@Autowired Flyway flyway;

	@DynamicPropertySource
	static void infrastructure(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", POSTGRES::jdbcUrl);
		registry.add("spring.datasource.username", POSTGRES::username);
		registry.add("spring.datasource.password", () -> "");
	}
	@AfterAll static void stopPostgres() { POSTGRES.close(); }

	@Test
	void listsEveryUndeletedResidentOnceWithSharedUnitRepresentativeAndMaskedPhone() {
		var property = property(true);
		var actor = users.saveAndFlush(User.create("관리소장", null));
		member(property.getId(), actor.getId());
		var building = buildings.saveAndFlush(Building.create(property, "103동", 0, AT));
		var unit = units.saveAndFlush(Unit.create(property, building, "301", null, 3, UnitStatus.ACTIVE, AT));
		var first = resident(property.getId(), "김민수", "ACTIVE", actor.getId());
		var second = resident(property.getId(), "박서연", "ACTIVE", null);
		var movedOut = resident(property.getId(), "퇴거 주민", "MOVED_OUT", null);
		var inactive = resident(property.getId(), "보관 주민", "INACTIVE", null);
		var deleted = resident(property.getId(), "삭제 주민", "ACTIVE", null);
		jdbc.update("update residents set deleted_at=now() where id=?", deleted);
		relation(property.getId(), first, unit.getId(), "ACTIVE", true);
		relation(property.getId(), first, unit.getId(), "MOVED_OUT", false);
		relation(property.getId(), second, unit.getId(), "ACTIVE", false);
		resident(property(false).getId(), "다른 대상 주민", "ACTIVE", null);

		var response = service.list(actor.getId(), property.getId());
		assertThat(response.hasBuildings()).isTrue();
		assertThat(response.buildings()).extracting(item -> item.name()).containsExactly("103동");
		assertThat(response.residents()).extracting(item -> item.id()).containsExactlyInAnyOrder(first, second, movedOut, inactive);
		assertThat(response.residents().stream().filter(item -> unit.getId().equals(item.unitId()))).hasSize(2);
		var representative = response.residents().stream().filter(item -> item.id().equals(first)).findFirst().orElseThrow();
		assertThat(representative.representative()).isTrue();
		assertThat(representative.phoneLast4()).isEqualTo("1234");
		assertThat(representative.signupStatus()).isEqualTo(ResidentSignupStatus.NOT_JOINED);
		assertThat(response.residents().stream().filter(item -> item.id().equals(second)).findFirst().orElseThrow().representative()).isFalse();
	}

	@Test
	void allowsManyResidentsPerUnitButRejectsTwoCurrentUnitsForOneResidentAndCrossPropertyRelations() {
		var property = property(false);
		var unit = units.saveAndFlush(Unit.create(property, null, "101", null, null, UnitStatus.ACTIVE, AT));
		var otherUnit = units.saveAndFlush(Unit.create(property, null, "102", null, null, UnitStatus.ACTIVE, AT));
		var person = resident(property.getId(), "현재 주민", "ACTIVE", null);
		relation(property.getId(), person, unit.getId(), "ACTIVE", true);
		assertThatThrownBy(() -> relation(property.getId(), person, otherUnit.getId(), "ACTIVE", false))
			.isInstanceOf(DataIntegrityViolationException.class);
		var elsewhere = property(false);
		var foreignResident = resident(elsewhere.getId(), "다른 대상 주민", "ACTIVE", null);
		assertThatThrownBy(() -> relation(property.getId(), foreignResident, unit.getId(), "ACTIVE", false))
			.isInstanceOf(DataIntegrityViolationException.class);
		var foreignUnit = units.saveAndFlush(Unit.create(elsewhere, null, "101", null, null, UnitStatus.ACTIVE, AT));
		var local = resident(property.getId(), "명부 주민", "ACTIVE", null);
		assertThatThrownBy(() -> relation(property.getId(), local, foreignUnit.getId(), "ACTIVE", false))
			.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void upgradesExistingPropertyAndUnitSchemaWithoutChangingStoredIds() {
		flyway.validate();
		String schema = "resident_upgrade_" + UUID.randomUUID().toString().replace("-", "");
		Flyway previous = Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
			.schemas(schema).defaultSchema(schema).target("20261008132205").load();
		previous.migrate();
		var propertyId = UUID.randomUUID();
		var unitId = UUID.randomUUID();
		jdbc.update("insert into " + schema + ".properties (id,name,address,has_buildings,status,created_at,updated_at) values (?,'기존 대상','주소',false,'ACTIVE',now(),now())", propertyId);
		jdbc.update("insert into " + schema + ".units (id,property_id,unit_number,status,created_at,updated_at) values (?,?,'001','ACTIVE',now(),now())", unitId, propertyId);
		Flyway upgraded = Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
			.schemas(schema).defaultSchema(schema).load();
		assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(2);
		upgraded.validate();
		assertThat(jdbc.queryForObject("select unit_number from " + schema + ".units where id=?", String.class, unitId)).isEqualTo("001");
		assertThat(jdbc.queryForObject("select count(*) from " + schema + ".residents", Integer.class)).isZero();
	}


    @Test
    void derivesSignupFromActualApprovalAndConfirmedCurrentUnitRequestsWithoutGuessingPeople() {
        var property = property(false);
        var actor = users.saveAndFlush(User.create("관리소장", null)).getId();
        member(property.getId(), actor);
        var unit = units.saveAndFlush(Unit.create(property, null, "301", null, null, UnitStatus.ACTIVE, AT));
        var oldUnit = units.saveAndFlush(Unit.create(property, null, "302", null, null, UnitStatus.ACTIVE, AT));
        var approvedUser = users.saveAndFlush(User.create("가입 계정", null)).getId();
        member(property.getId(), approvedUser);
        var approved = resident(property.getId(), "가입 완료 주민", "ACTIVE", approvedUser);
        relation(property.getId(), approved, unit.getId(), "ACTIVE", false);
        request(property.getId(), unit.getId(), approvedUser, approved, "MANUAL", "APPROVED");
        // 계정 ID만 연결된 주민을 가입 완료로 취급하지 않습니다.
        var linkedOnly = resident(property.getId(), "연결만 된 주민", "ACTIVE", actor);
        relation(property.getId(), linkedOnly, unit.getId(), "ACTIVE", false);
        var pending = resident(property.getId(), "확인된 대기 주민", "ACTIVE", null);
        relation(property.getId(), pending, unit.getId(), "ACTIVE", false);
        var requestUser = users.saveAndFlush(User.create("신청 계정", null)).getId();
        request(property.getId(), unit.getId(), requestUser, pending, "MATCHED", "PENDING");
        request(property.getId(), unit.getId(), users.saveAndFlush(User.create("다른 신청 계정", null)).getId(), pending, "MANUAL", "PENDING");
        // 동일 호수·연락처의 미확인/가능성 후보는 승인 대기 주민으로 확정하지 않습니다.
        var possible = resident(property.getId(), "미확인 후보", "ACTIVE", null);
        relation(property.getId(), possible, unit.getId(), "ACTIVE", false);
        request(property.getId(), unit.getId(), users.saveAndFlush(User.create("가능성 계정", null)).getId(), possible, "POSSIBLE", "PENDING");
        request(property.getId(), unit.getId(), users.saveAndFlush(User.create("미확인 계정", null)).getId(), null, "NOT_MATCHED", "PENDING");
        var oldPending = resident(property.getId(), "과거 세대 대기", "ACTIVE", null);
        relation(property.getId(), oldPending, unit.getId(), "ACTIVE", false);
        request(property.getId(), oldUnit.getId(), requestUser, oldPending, "MATCHED", "PENDING");
        for (var status : List.of("REJECTED", "CANCELED")) {
            request(property.getId(), unit.getId(), requestUser, possible, "MATCHED", status);
        }
        var deletedRequest = request(property.getId(), unit.getId(), users.saveAndFlush(User.create("삭제 신청 계정", null)).getId(), possible, "MATCHED", "PENDING");
        jdbc.update("update membership_requests set deleted_at=now() where id=?", deletedRequest);

        var result = service.list(actor, property.getId());
        assertThat(result.residents()).hasSize(5);
        var states = result.residents().stream().collect(java.util.stream.Collectors.toMap(item -> item.id(), item -> item.signupStatus()));
        assertThat(states).containsEntry(approved, ResidentSignupStatus.APPROVED)
            .containsEntry(pending, ResidentSignupStatus.PENDING)
            .containsEntry(linkedOnly, ResidentSignupStatus.NOT_JOINED)
            .containsEntry(possible, ResidentSignupStatus.NOT_JOINED)
            .containsEntry(oldPending, ResidentSignupStatus.NOT_JOINED);
        // 과거 승인이 있어도 현재 참여가 끝났거나 현재 세대의 승인이 아니면 가입 완료가 아닙니다.
        jdbc.update("update property_members set ended_at=now() where property_id=? and user_id=?", property.getId(), approvedUser);
        assertThat(service.list(actor, property.getId()).residents().stream().filter(item -> item.id().equals(approved)).findFirst().orElseThrow().signupStatus())
            .isEqualTo(ResidentSignupStatus.NOT_JOINED);
        jdbc.update("update property_members set ended_at=null where property_id=? and user_id=?", property.getId(), approvedUser);
        jdbc.update("update membership_requests set unit_id=? where user_id=? and status='APPROVED'", oldUnit.getId(), approvedUser);
        assertThat(service.list(actor, property.getId()).residents().stream().filter(item -> item.id().equals(approved)).findFirst().orElseThrow().signupStatus())
            .isEqualTo(ResidentSignupStatus.NOT_JOINED);
    }

    @Test
    void pendingRequestConstraintsKeepDifferentHouseholdMembersAndPropertiesSeparate() {
        var property = property(false);
        var unit = units.saveAndFlush(Unit.create(property, null, "301", null, null, UnitStatus.ACTIVE, AT));
        var user = users.saveAndFlush(User.create("신청자", null)).getId();
        request(property.getId(), unit.getId(), user, null, "NOT_MATCHED", "PENDING");
        assertThatThrownBy(() -> request(property.getId(), unit.getId(), user, null, "NOT_MATCHED", "PENDING"))
            .isInstanceOf(DataIntegrityViolationException.class);
        request(property.getId(), unit.getId(), users.saveAndFlush(User.create("같은 세대 신청자", null)).getId(), null, "NOT_MATCHED", "PENDING");
        var other = property(false);
        var foreignPerson = resident(other.getId(), "다른 관리대상 주민", "ACTIVE", null);
        assertThatThrownBy(() -> request(property.getId(), unit.getId(), user, foreignPerson, "MATCHED", "REJECTED"))
            .isInstanceOf(DataIntegrityViolationException.class);
        var foreignUnit = units.saveAndFlush(Unit.create(other, null, "301", null, null, UnitStatus.ACTIVE, AT));
        assertThatThrownBy(() -> request(property.getId(), foreignUnit.getId(), user, null, "NOT_MATCHED", "REJECTED"))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void upgradesResidentSchemaAndPreservesExistingRosterWhenAddingRequests() {
        String schema = "signup_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        Flyway previous = Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
            .schemas(schema).defaultSchema(schema).target("20261010041826").load();
        previous.migrate();
        var propertyId = UUID.randomUUID();
        var residentId = UUID.randomUUID();
        jdbc.update("insert into " + schema + ".properties(id,name,address,has_buildings,status,created_at,updated_at) values (?,'기존 대상','주소',false,'ACTIVE',now(),now())", propertyId);
        jdbc.update("insert into " + schema + ".residents(id,property_id,name,status,created_at,updated_at) values (?,?,'기존 주민','ACTIVE',now(),now())", residentId, propertyId);
        Flyway upgraded = Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
            .schemas(schema).defaultSchema(schema).load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(1);
        upgraded.validate();
        assertThat(jdbc.queryForObject("select name from " + schema + ".residents where id=?", String.class, residentId)).isEqualTo("기존 주민");
        assertThat(jdbc.queryForObject("select count(*) from " + schema + ".membership_requests", Integer.class)).isZero();
    }

    private UUID request(UUID propertyId, UUID unitId, UUID userId, UUID residentId, String matchStatus, String status) {
        var id = UUID.randomUUID();
        jdbc.update("insert into membership_requests(id,property_id,unit_id,user_id,matched_resident_id,request_phone_encrypted,request_phone_hmac,request_phone_last4,match_status,status,requested_at,created_at,updated_at) values (?,?,?,?,?,'opaque-test-cipher',?,'1234',?,?,now(),now(),now())",
            id, propertyId, unitId, userId, residentId, "a".repeat(64), matchStatus, status);
        return id;
    }

	private Property property(boolean hasBuildings) {
		return properties.saveAndFlush(Property.create("주민 조회 대상", "주소", null, null, hasBuildings, AT));
	}
	private void member(UUID propertyId, UUID userId) {
		jdbc.update("insert into property_members(id,property_id,user_id,role,status,joined_at,created_at,updated_at) values (?,?,?,'ADMIN','ACTIVE',now(),now(),now())", UUID.randomUUID(), propertyId, userId);
	}
	private UUID resident(UUID propertyId, String name, String status, UUID userId) {
		var id = UUID.randomUUID();
		jdbc.update("insert into residents(id,property_id,name,status,user_id,phone_encrypted,phone_hmac,phone_last4,created_at,updated_at) values (?,?,?,?,?,'opaque-test-cipher',?,'1234',now(),now())", id, propertyId, name, status, userId, "a".repeat(64));
		return id;
	}
	private void relation(UUID propertyId, UUID residentId, UUID unitId, String status, boolean representative) {
		jdbc.update("insert into unit_residents(id,property_id,resident_id,unit_id,relation_type,status,is_household_rep,created_at,updated_at) values (?,?,?,?,'FAMILY',?,?,now(),now())", UUID.randomUUID(), propertyId, residentId, unitId, status, representative);
	}

	@TestConfiguration
	static class Beans {
		@Bean java.time.Clock clock() { return java.time.Clock.systemUTC(); }
	}
}
