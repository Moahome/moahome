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
@Import({com.moahome.server.property.service.UnitManagementService.class, ResidentListService.class, ManagementAccessService.class, UserService.class, ResidentDirectoryPersistenceTest.Beans.class, com.moahome.server.resident.service.ResidentRegistrationService.class, com.moahome.server.resident.service.ResidentImportService.class, com.moahome.server.resident.service.ResidentExcelReader.class, com.moahome.server.resident.service.ResidentManagementService.class})
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
	@Autowired com.moahome.server.property.service.UnitManagementService unitManagement;
	@Autowired com.moahome.server.resident.service.ResidentManagementService management;
	@Autowired com.moahome.server.resident.service.ResidentRegistrationService registrations;
	@Autowired com.moahome.server.common.security.PhoneSecurity phoneSecurity;
	@Autowired JdbcTemplate jdbc;
	@Autowired Flyway flyway;
    @Autowired com.moahome.server.resident.service.ResidentImportService imports;
    @Autowired ResidentImportBatchRepository batches;

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
        var summary = unitManagement.list(actor.getId(), property.getId()).residentSummaries().get(unit.getId());
        assertThat(summary.representativeName()).isEqualTo("김민수");
        assertThat(summary.total()).isEqualTo(2);
        assertThat(summary.notJoined()).isEqualTo(2);
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
		assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(3);
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
        var summaries = unitManagement.list(actor, property.getId()).residentSummaries();
        assertThat(summaries.get(unit.getId())).isEqualTo(new com.moahome.server.property.dto.UnitListResponse.ResidentSummary(null, 5, 1, 1, 3));
        assertThat(summaries.get(oldUnit.getId())).isEqualTo(new com.moahome.server.property.dto.UnitListResponse.ResidentSummary(null, 0, 0, 0, 0));
        // 과거 승인이 있어도 현재 참여가 끝났거나 현재 세대의 승인이 아니면 가입 완료가 아닙니다.
        jdbc.update("update property_members set ended_at=now() where property_id=? and user_id=?", property.getId(), approvedUser);
        assertThat(service.list(actor, property.getId()).residents().stream().filter(item -> item.id().equals(approved)).findFirst().orElseThrow().signupStatus())
            .isEqualTo(ResidentSignupStatus.NOT_JOINED);
        assertThat(unitManagement.list(actor, property.getId()).residentSummaries().get(unit.getId()).approved()).isZero();
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
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(2);
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

    @Test
    void registersOptionalPhoneAndDoesNotGrantAccountOrMembership() {
        var property = property(false);
        var actor = users.saveAndFlush(User.create("등록 관리자", null)).getId();
        member(property.getId(), actor);
        var unit = units.saveAndFlush(Unit.create(property, null, "201", null, null, UnitStatus.VACANT, AT));
        var first = registration(unit.getId(), "  첫 주민  ", "010-1234-5678");
        var result = registrations.register(actor, property.getId(), first);
        assertThat(result.representative()).isTrue();
        assertThat(result.id()).isEqualTo(first.requestId());
        var stored = jdbc.queryForMap("select * from residents where id=?", result.id());
        assertThat(stored.get("name")).isEqualTo("첫 주민");
        assertThat(stored.get("phone_encrypted")).isNotEqualTo("010-1234-5678");
        assertThat(phoneSecurity.decrypt((String) stored.get("phone_encrypted"))).isEqualTo("+821012345678");
        assertThat(stored.get("phone_hmac")).isEqualTo(phoneSecurity.hmac("+821012345678"));
        assertThat(stored.get("phone_last4")).isEqualTo("5678");
        assertThat(stored.get("user_id")).isNull();
        var second = registrations.register(actor, property.getId(), registration(unit.getId(), "두 번째 주민", null));
        assertThat(second.representative()).isFalse();
        assertThat(jdbc.queryForObject("select phone_encrypted from residents where id=?", String.class, second.id())).isNull();
        assertThat(jdbc.queryForObject("select count(*) from property_members where property_id=?", Integer.class, property.getId())).isEqualTo(1);
        assertThat(service.list(actor, property.getId()).residents()).hasSize(2).allMatch(item -> item.signupStatus() == ResidentSignupStatus.NOT_JOINED);
        assertThat(units.findById(unit.getId()).orElseThrow().getStatus()).isEqualTo(UnitStatus.VACANT);
    }

    @Test
    void preventsDuplicateNamesWithNormalizedPhoneAndReplaysSameRequestWithoutNewRows() {
        var property = property(false);
        var actor = users.saveAndFlush(User.create("중복 검사 관리자", null)).getId();
        member(property.getId(), actor);
        var unit = units.saveAndFlush(Unit.create(property, null, "301", null, null, UnitStatus.ACTIVE, AT));
        var input = registration(unit.getId(), "동일 주민", "010-2345-6789");
        var first = registrations.register(actor, property.getId(), input);
        assertThat(registrations.register(actor, property.getId(), input)).isEqualTo(first);
        assertThatThrownBy(() -> registrations.register(actor, property.getId(), registration(unit.getId(), "동일 주민", "+82 10 2345 6789")))
            .isInstanceOfSatisfying(com.moahome.server.resident.exception.ResidentRegistrationException.class,
                error -> assertThat(error.code().name()).isEqualTo("DUPLICATE_RESIDENT"));
        // 전화번호 공유와 연락처 없는 동명이인은 주민을 자동 병합하거나 배제할 근거가 아닙니다.
        registrations.register(actor, property.getId(), registration(unit.getId(), "다른 가족", "01023456789"));
        registrations.register(actor, property.getId(), registration(unit.getId(), "동명이인", null));
        registrations.register(actor, property.getId(), registration(unit.getId(), "동명이인", null));
        assertThat(service.list(actor, property.getId()).residents()).hasSize(4);
        var changed = new com.moahome.server.resident.dto.ResidentRegistrationRequest(input.requestId(), "다른 이름", null, unit.getId(), "FAMILY");
        assertThatThrownBy(() -> registrations.register(actor, property.getId(), changed))
            .isInstanceOfSatisfying(com.moahome.server.resident.exception.ResidentRegistrationException.class,
                error -> assertThat(error.code().name()).isEqualTo("REGISTRATION_CONFLICT"));
        jdbc.update("update residents set deleted_at=now() where id=?", first.id());
        assertThatThrownBy(() -> registrations.register(actor, property.getId(), registration(unit.getId(), "동일 주민", "01023456789")))
            .isInstanceOfSatisfying(com.moahome.server.resident.exception.ResidentRegistrationException.class,
                error -> assertThat(error.code().name()).isEqualTo("RESIDENT_RESTORE_REQUIRED"));
    }

    @Test
    void rejectsForeignDeletedUnitsAndManagerAndRollsBackFailedAffiliation() {
        var property = property(false);
        var actor = users.saveAndFlush(User.create("검증 관리자", null)).getId();
        member(property.getId(), actor);
        var unit = units.saveAndFlush(Unit.create(property, null, "401", null, null, UnitStatus.ACTIVE, AT));
        var other = property(false);
        var foreignUnit = units.saveAndFlush(Unit.create(other, null, "401", null, null, UnitStatus.ACTIVE, AT));
        assertThatThrownBy(() -> registrations.register(actor, property.getId(), registration(foreignUnit.getId(), "주민", null)))
            .isInstanceOf(com.moahome.server.resident.exception.ResidentRegistrationException.class);
        var invalid = new com.moahome.server.resident.dto.ResidentRegistrationRequest(UUID.randomUUID(), "주민", null, unit.getId(), "UNKNOWN");
        assertThatThrownBy(() -> registrations.register(actor, property.getId(), invalid)).isInstanceOf(IllegalArgumentException.class);
        assertThat(jdbc.queryForObject("select count(*) from residents where id=?", Integer.class, invalid.requestId())).isZero();
        var malformedPhone = registration(unit.getId(), "잘못된 연락처", "010-abcd-1234");
        assertThatThrownBy(() -> registrations.register(actor, property.getId(), malformedPhone)).isInstanceOf(IllegalArgumentException.class);
        assertThat(service.list(actor, property.getId()).residents()).isEmpty();
        jdbc.update("update units set deleted_at=now() where id=?", unit.getId());
        assertThatThrownBy(() -> registrations.register(actor, property.getId(), registration(unit.getId(), "주민", null)))
            .isInstanceOf(com.moahome.server.resident.exception.ResidentRegistrationException.class);
        jdbc.update("update property_members set role='MANAGER' where property_id=? and user_id=?", property.getId(), actor);
        assertThatThrownBy(() -> registrations.register(actor, property.getId(), registration(unit.getId(), "주민", null)))
            .isInstanceOf(com.moahome.server.auth.exception.AuthException.class);
    }

    @Test
    void concurrentRegistrationsChooseExactlyOneFirstRepresentative() throws Exception {
        var property = property(false);
        var actor = users.saveAndFlush(User.create("동시 등록 관리자", null)).getId();
        member(property.getId(), actor);
        var unit = units.saveAndFlush(Unit.create(property, null, "501", null, null, UnitStatus.ACTIVE, AT));
        var gate = new java.util.concurrent.CountDownLatch(1);
        try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> { gate.await(); return registrations.register(actor, property.getId(), registration(unit.getId(), "첫 요청", null)); });
            var second = pool.submit(() -> { gate.await(); return registrations.register(actor, property.getId(), registration(unit.getId(), "둘째 요청", null)); });
            gate.countDown();
            var results = List.of(first.get(10, java.util.concurrent.TimeUnit.SECONDS), second.get(10, java.util.concurrent.TimeUnit.SECONDS));
            assertThat(results.stream().filter(item -> item.representative()).count()).isEqualTo(1);
        }
        assertThat(service.list(actor, property.getId()).residents()).hasSize(2);
        // 기존 대표가 사라진 뒤 새 주민을 추가해도 대표 변경 절차를 대신해 자동 승계하지 않습니다.
        jdbc.update("update unit_residents set status='MOVED_OUT' where property_id=?", property.getId());
        assertThat(registrations.register(actor, property.getId(), registration(unit.getId(), "후속 주민", null)).representative()).isFalse();
    }

    @Test
    void importPreviewMasksEncryptsAndExcludesDuplicatesAndInvalidRowsWithoutRegistering() throws Exception {
        var property = property(true);
        var actor = users.saveAndFlush(User.create("업로드 관리자", null)).getId();
        member(property.getId(), actor);
        var building = buildings.saveAndFlush(Building.create(property, "102동", 0, AT));
        var unit = units.saveAndFlush(Unit.create(property, building, "301", null, null, UnitStatus.ACTIVE, AT));
        registrations.register(actor, property.getId(), registration(unit.getId(), "기존 주민", "010-1234-5678"));
        var preview = imports.preview(actor, property.getId(), excel(new String[][] {
            {"102", "301호", "신규 주민", "소유주", "010-2345-6789"},
            {"102동", "301", "신규 주민", "가족", "+82 10 2345 6789"},
            {"102동", "301", "기존 주민", "소유자", "01012345678"},
            {"102동", "999", "세대 오류", "가족", ""},
            {"102동", "301", "번호 오류", "가족", "1012345678"},
            {"102동", "301", "연락처 없음", "가족", ""}
        }));
        assertThat(preview.rows()).extracting(row -> row.status()).containsExactly("READY", "DUPLICATE", "DUPLICATE", "ERROR", "ERROR", "READY");
        assertThat(preview.rows().get(2).relationType()).isEqualTo("OWNER");
        assertThat(preview.rows().getFirst().phoneLast4()).isEqualTo("6789");
        assertThat(preview.rows().getFirst().relationType()).isEqualTo("OWNER");
        assertThat(service.list(actor, property.getId()).residents()).hasSize(1);
        var payload = batches.findById(preview.importId()).orElseThrow().getRowsPayload();
        assertThat(payload).contains("phoneEncrypted").doesNotContain("010-2345-6789", "+821023456789", "01012345678");
        assertThat(new tools.jackson.databind.ObjectMapper().writeValueAsString(preview)).doesNotContain("phoneEncrypted", "phoneHmac");
        assertThatThrownBy(() -> imports.commit(actor, property.getId(), preview.importId(), new com.moahome.server.resident.dto.ResidentImportCommitRequest(List.of(3))))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void importKeepsExcelOrderFirstSelectedRepresentativeAndReplaysContactlessRows() throws Exception {
        var property = property(false);
        var actor = users.saveAndFlush(User.create("업로드 관리자", null)).getId();
        member(property.getId(), actor);
        var unit = units.saveAndFlush(Unit.create(property, null, "301", null, null, UnitStatus.ACTIVE, AT));
        var existingUnit = units.saveAndFlush(Unit.create(property, null, "302", null, null, UnitStatus.ACTIVE, AT));
        var existing = registrations.register(actor, property.getId(), registration(existingUnit.getId(), "기존 대표", null));
        var preview = imports.preview(actor, property.getId(), excel(new String[][] {
            {"", "301", "선택 안 함", "소유주", ""},
            {"", "301", "첫 선택", "", ""},
            {"", "301", "두 번째", "가족", ""},
            {"", "302", "기존 세대 추가", "가족", ""},
            {"", "999", "오류 제외", "가족", ""}
        }));
        var selection = new com.moahome.server.resident.dto.ResidentImportCommitRequest(List.of(5, 4, 3));
        var result = imports.commit(actor, property.getId(), preview.importId(), selection);
        assertThat(result.rows()).extracting(row -> row.status()).containsExactly("NOT_SELECTED", "SUCCESS", "SUCCESS", "SUCCESS", "ERROR");
        assertThat(result.rows()).extracting(row -> row.representative()).containsExactly(false, true, false, false, false);
        var replay = imports.commit(actor, property.getId(), preview.importId(), selection);
        assertThat(replay).isEqualTo(result);
        var directory = service.list(actor, property.getId()).residents();
        assertThat(directory).hasSize(4);
        assertThat(directory.stream().filter(row -> row.id().equals(existing.id())).findFirst().orElseThrow().representative()).isTrue();
        assertThat(directory).allMatch(row -> row.signupStatus() == ResidentSignupStatus.NOT_JOINED);
        assertThat(directory.stream().filter(row -> row.name().equals("첫 선택")).findFirst().orElseThrow().relationType()).isEqualTo("OTHER");
    }

    @Test
    void importRechecksChangedRowsAndContinuesAfterDuplicateOrDeletedUnit() throws Exception {
        var property = property(false);
        var actor = users.saveAndFlush(User.create("업로드 관리자", null)).getId();
        member(property.getId(), actor);
        var unit = units.saveAndFlush(Unit.create(property, null, "301", null, null, UnitStatus.ACTIVE, AT));
        var removedUnit = units.saveAndFlush(Unit.create(property, null, "302", null, null, UnitStatus.ACTIVE, AT));
        var preview = imports.preview(actor, property.getId(), excel(new String[][] {
            {"", "301", "경합 주민", "가족", "010-1234-5678"},
            {"", "302", "세대 삭제", "가족", ""},
            {"", "301", "정상 주민", "가족", ""}
        }));
        registrations.register(actor, property.getId(), registration(unit.getId(), "경합 주민", "01012345678"));
        jdbc.update("update units set deleted_at=now() where id=?", removedUnit.getId());
        var result = imports.commit(actor, property.getId(), preview.importId(), new com.moahome.server.resident.dto.ResidentImportCommitRequest(List.of(2,3,4)));
        assertThat(result.rows()).extracting(row -> row.status()).containsExactly("DUPLICATE", "ERROR", "SUCCESS");
        assertThat(service.list(actor, property.getId()).residents()).hasSize(2);
    }

    @Test
    void importChecksAuthorRolePropertyExpiryAndDeletesExpiredPayloads() throws Exception {
        var property = property(false);
        var actor = users.saveAndFlush(User.create("업로드 관리자", null)).getId();
        var other = users.saveAndFlush(User.create("다른 관리자", null)).getId();
        member(property.getId(), actor);
        member(property.getId(), other);
        units.saveAndFlush(Unit.create(property, null, "301", null, null, UnitStatus.ACTIVE, AT));
        var file = excel(new String[][] {{"", "301", "주민", "가족", ""}});
        var preview = imports.preview(actor, property.getId(), file);
        var selection = new com.moahome.server.resident.dto.ResidentImportCommitRequest(List.of(2));
        assertThatThrownBy(() -> imports.commit(other, property.getId(), preview.importId(), selection))
            .isInstanceOf(com.moahome.server.resident.exception.ResidentImportException.class);
        jdbc.update("update property_members set role='MANAGER' where property_id=? and user_id=?", property.getId(), other);
        assertThatThrownBy(() -> imports.preview(other, property.getId(), file)).isInstanceOf(com.moahome.server.auth.exception.AuthException.class);
        assertThatThrownBy(() -> imports.commit(other, property.getId(), preview.importId(), selection)).isInstanceOf(com.moahome.server.auth.exception.AuthException.class);
        jdbc.update("update resident_import_batches set created_at=now()-interval '2 days', expires_at=now()-interval '1 day' where id=?", preview.importId());
        assertThatThrownBy(() -> imports.commit(actor, property.getId(), preview.importId(), selection))
            .isInstanceOf(com.moahome.server.resident.exception.ResidentImportException.class);
        imports.removeExpiredBatches();
        assertThat(batches.findById(preview.importId())).isEmpty();
        assertThat(service.list(actor, property.getId()).residents()).isEmpty();
    }

    private org.springframework.mock.web.MockMultipartFile excel(String[][] data) throws Exception {
        try (var workbook = new org.apache.poi.xssf.usermodel.XSSFWorkbook(); var bytes = new java.io.ByteArrayOutputStream()) {
            var sheet = workbook.createSheet();
            var header = sheet.createRow(0);
            String[] labels = {"동", "호수", "이름", "관계", "연락처"};
            for (int index = 0; index < 5; index++) header.createCell(index).setCellValue(labels[index]);
            for (int row = 0; row < data.length; row++) {
                var target = sheet.createRow(row + 1);
                for (int col = 0; col < 5; col++) target.createCell(col).setCellValue(data[row][col]);
            }
            workbook.write(bytes);
            return new org.springframework.mock.web.MockMultipartFile("file", "residents.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes.toByteArray());
        }
    }

    private com.moahome.server.resident.dto.ResidentRegistrationRequest registration(UUID unitId, String name, String phone) {
        return new com.moahome.server.resident.dto.ResidentRegistrationRequest(UUID.randomUUID(), name, phone, unitId, "TENANT");
    }

    @Test
    void detailMasksAndExplicitRevealRequiresCurrentAdminAndSameUndeletedPropertyResident() {
        var property = property(false);
        var actor = users.saveAndFlush(User.create("상세 관리자", null)).getId();
        member(property.getId(), actor);
        var unit = units.saveAndFlush(Unit.create(property, null, "501", null, null, UnitStatus.ACTIVE, AT));
        var saved = registrations.register(actor, property.getId(), registration(unit.getId(), "상세 주민", "01012345678"));
        var detail = management.detail(actor, property.getId(), saved.id());
        assertThat(detail.phoneLast4()).isEqualTo("5678");
        assertThat(detail.representative()).isTrue();
        assertThat(management.revealPhone(actor, property.getId(), saved.id())).isEqualTo("+821012345678");
        var other = property(false);
        member(other.getId(), actor);
        assertThatThrownBy(() -> management.revealPhone(actor, other.getId(), saved.id()))
            .isInstanceOf(com.moahome.server.resident.exception.ResidentRegistrationException.class)
            .hasMessage("RESIDENT_NOT_FOUND");
        var outsider = users.saveAndFlush(User.create("상세 외부 계정", null)).getId();
        assertThatThrownBy(() -> management.detail(outsider, property.getId(), saved.id()))
            .isInstanceOf(com.moahome.server.auth.exception.AuthException.class);
        jdbc.update("update residents set phone_encrypted='invalid-cipher' where id=?", saved.id());
        assertThatThrownBy(() -> management.revealPhone(actor, property.getId(), saved.id())).hasMessage("PHONE_SECURITY_UNAVAILABLE");
    }

    @Test
    void updatesContactAndConfirmedApplicationsTogetherButLeavesUnconfirmedPeopleUntouched() {
        var property = property(false);
        var actor = users.saveAndFlush(User.create("수정 관리자", null)).getId();
        member(property.getId(), actor);
        var unit = units.saveAndFlush(Unit.create(property, null, "502", null, null, UnitStatus.ACTIVE, AT));
        var id = registrations.register(actor, property.getId(), registration(unit.getId(), "번호 수정", "01012345678")).id();
        var applicant = users.saveAndFlush(User.create("확인 신청 계정", null)).getId();
        var confirmed = request(property.getId(), unit.getId(), applicant, id, "MATCHED", "PENDING");
        var possible = request(property.getId(), unit.getId(), users.saveAndFlush(User.create("미확인 신청 계정", null)).getId(), id, "POSSIBLE", "PENDING");
        var detail = management.detail(actor, property.getId(), id);
        assertThat(detail.hasLinkedRequests()).isTrue();
        var input = new com.moahome.server.resident.dto.ResidentUpdateRequest("변경 주민", unit.getId(), "OWNER", "REPLACE", "01098765432", null, detail.updatedAt());
        var updated = management.update(actor, property.getId(), id, input);
        assertThat(updated.name()).isEqualTo("변경 주민");
        assertThat(updated.phoneLast4()).isEqualTo("5432");
        assertThat(updated.relationType()).isEqualTo("OWNER");
        assertThat(updated.representative()).isTrue();
        assertThat(phoneSecurity.decrypt(jdbc.queryForObject("select request_phone_encrypted from membership_requests where id=?", String.class, confirmed)))
            .isEqualTo("+821098765432");
        assertThat(jdbc.queryForObject("select request_phone_last4 from membership_requests where id=?", String.class, possible)).isEqualTo("1234");
        assertThatThrownBy(() -> management.update(actor, property.getId(), id,
            new com.moahome.server.resident.dto.ResidentUpdateRequest("변경 주민", unit.getId(), "OWNER", "REMOVE", null, null, updated.updatedAt())))
            .hasMessage("CONTACT_REQUIRED_FOR_REQUEST");
        assertThat(management.revealPhone(actor, property.getId(), id)).isEqualTo("+821098765432");
        assertThatThrownBy(() -> management.update(actor, property.getId(), id, input)).hasMessage("RESIDENT_CHANGED");
    }

    @Test
    void representativeMoveRequiresExplicitRemainingResidentAndPreservesOldAffiliationAndDestinationRepresentative() {
        var property = property(false);
        var actor = users.saveAndFlush(User.create("이동 관리자", null)).getId();
        member(property.getId(), actor);
        var source = units.saveAndFlush(Unit.create(property, null, "503", null, null, UnitStatus.ACTIVE, AT));
        var destination = units.saveAndFlush(Unit.create(property, null, "504", null, null, UnitStatus.ACTIVE, AT));
        var id = registrations.register(actor, property.getId(), registration(source.getId(), "이동 대표", null)).id();
        var remaining = registrations.register(actor, property.getId(), registration(source.getId(), "남은 주민", null)).id();
        var destinationRep = registrations.register(actor, property.getId(), registration(destination.getId(), "도착지 대표", null)).id();
        var detail = management.detail(actor, property.getId(), id);
        assertThat(detail.representativeCandidates()).extracting(item -> item.id()).containsExactly(remaining);
        assertThatThrownBy(() -> management.update(actor, property.getId(), id,
            new com.moahome.server.resident.dto.ResidentUpdateRequest("이동 대표", destination.getId(), "TENANT", "KEEP", null, null, detail.updatedAt())))
            .hasMessage("REPRESENTATIVE_REQUIRED");
        assertThatThrownBy(() -> management.update(actor, property.getId(), id,
            new com.moahome.server.resident.dto.ResidentUpdateRequest("이동 대표", destination.getId(), "TENANT", "KEEP", null, destinationRep, detail.updatedAt())))
            .hasMessage("INVALID_REPRESENTATIVE");
        assertThat(management.detail(actor, property.getId(), id).unitId()).isEqualTo(source.getId());
        var moved = management.update(actor, property.getId(), id,
            new com.moahome.server.resident.dto.ResidentUpdateRequest("이동 대표", destination.getId(), "TENANT", "KEEP", null, remaining, detail.updatedAt()));
        assertThat(moved.unitId()).isEqualTo(destination.getId());
        assertThat(moved.representative()).isFalse();
        assertThat(management.detail(actor, property.getId(), remaining).representative()).isTrue();
        assertThat(management.detail(actor, property.getId(), destinationRep).representative()).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from unit_residents where resident_id=? and status='MOVED_OUT' and deleted_at is null", Integer.class, id)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from unit_residents where resident_id=? and status='ACTIVE' and deleted_at is null", Integer.class, id)).isEqualTo(1);
    }

    @Test
    void deleteTransfersSelectedRepresentativeEndsOnlyThisPropertyResidentAccessAndCancelsConfirmedPending() {
        var property = property(false);
        var actor = users.saveAndFlush(User.create("삭제 관리자", null)).getId();
        var user = users.saveAndFlush(User.create("삭제 주민 계정", null)).getId();
        member(property.getId(), actor);
        member(property.getId(), user);
        jdbc.update("update property_members set role='RESIDENT' where property_id=? and user_id=?", property.getId(), user);
        var other = property(false);
        member(other.getId(), user);
        jdbc.update("update property_members set role='RESIDENT' where property_id=? and user_id=?", other.getId(), user);
        var unit = units.saveAndFlush(Unit.create(property, null, "505", null, null, UnitStatus.ACTIVE, AT));
        var id = registrations.register(actor, property.getId(), registration(unit.getId(), "삭제 대표", "01012345678")).id();
        var remaining = registrations.register(actor, property.getId(), registration(unit.getId(), "승계 주민", null)).id();
        jdbc.update("update residents set user_id=? where id=?", user, id);
        request(property.getId(), unit.getId(), user, id, "MANUAL", "APPROVED");
        var pending = request(property.getId(), unit.getId(), user, id, "MATCHED", "PENDING");
        var detail = management.detail(actor, property.getId(), id);
        assertThatThrownBy(() -> management.delete(actor, property.getId(), id,
            new com.moahome.server.resident.dto.ResidentDeleteRequest(null, detail.updatedAt()))).hasMessage("REPRESENTATIVE_REQUIRED");
        assertThat(jdbc.queryForObject("select status from property_members where property_id=? and user_id=?", String.class, property.getId(), user)).isEqualTo("ACTIVE");
        var input = new com.moahome.server.resident.dto.ResidentDeleteRequest(remaining, detail.updatedAt());
        management.delete(actor, property.getId(), id, input);
        management.delete(actor, property.getId(), id, input);
        assertThatThrownBy(() -> management.detail(actor, property.getId(), id)).hasMessage("RESIDENT_NOT_FOUND");
        assertThatThrownBy(() -> management.revealPhone(actor, property.getId(), id)).hasMessage("RESIDENT_NOT_FOUND");
        assertThat(management.detail(actor, property.getId(), remaining).representative()).isTrue();
        assertThat(jdbc.queryForObject("select status from property_members where property_id=? and user_id=?", String.class, property.getId(), user)).isEqualTo("INACTIVE");
        assertThat(jdbc.queryForObject("select status from property_members where property_id=? and user_id=?", String.class, other.getId(), user)).isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject("select status from membership_requests where id=?", String.class, pending)).isEqualTo("CANCELED");
        assertThat(jdbc.queryForObject("select deleted_by from residents where id=?", UUID.class, id)).isEqualTo(actor);
        assertThat(jdbc.queryForObject("select count(*) from unit_residents where resident_id=? and deleted_at is not null", Integer.class, id)).isEqualTo(1);
        assertThat(service.list(actor, property.getId()).residents()).extracting(item -> item.id()).doesNotContain(id);
    }

    @Test
    void detailRetainsExplicitSuccessorSelectionWhenTheOriginalUnitWasDeleted() {
        var property = property(false);
        var actor = users.saveAndFlush(User.create("삭제 세대 관리자", null)).getId();
        member(property.getId(), actor);
        var unit = units.saveAndFlush(Unit.create(property, null, "507", null, null, UnitStatus.ACTIVE, AT));
        var id = registrations.register(actor, property.getId(), registration(unit.getId(), "남은 관계 대표", null)).id();
        var remaining = registrations.register(actor, property.getId(), registration(unit.getId(), "남은 관계 주민", null)).id();
        jdbc.update("update units set deleted_at=now() where id=?", unit.getId());
        var detail = management.detail(actor, property.getId(), id);
        assertThat(detail.unitId()).isNull();
        assertThat(detail.representativeCandidates()).extracting(item -> item.id()).containsExactly(remaining);
        management.delete(actor, property.getId(), id,
            new com.moahome.server.resident.dto.ResidentDeleteRequest(remaining, detail.updatedAt()));
        assertThat(jdbc.queryForObject("select is_household_rep from unit_residents where resident_id=? and status='ACTIVE'", Boolean.class, remaining)).isTrue();
    }

    @Test
    void updateKeepsMaskedContactWithoutDecryptingAndRejectsDuplicateNameAndContactAtomically() {
        var property = property(false);
        var actor = users.saveAndFlush(User.create("중복 수정 관리자", null)).getId();
        member(property.getId(), actor);
        var unit = units.saveAndFlush(Unit.create(property, null, "506", null, null, UnitStatus.ACTIVE, AT));
        var id = registrations.register(actor, property.getId(), registration(unit.getId(), "수정 전 주민", "01012345678")).id();
        registrations.register(actor, property.getId(), registration(unit.getId(), "기존 주민", "01012345678"));
        var detail = management.detail(actor, property.getId(), id);
        assertThatThrownBy(() -> management.update(actor, property.getId(), id,
            new com.moahome.server.resident.dto.ResidentUpdateRequest("기존 주민", unit.getId(), "OWNER", "KEEP", null, null, detail.updatedAt())))
            .hasMessage("DUPLICATE_RESIDENT");
        assertThat(management.detail(actor, property.getId(), id).name()).isEqualTo("수정 전 주민");
        var updated = management.update(actor, property.getId(), id,
            new com.moahome.server.resident.dto.ResidentUpdateRequest("수정 후 주민", unit.getId(), "OWNER", "KEEP", null, null, detail.updatedAt()));
        assertThat(updated.phoneLast4()).isEqualTo("5678");
        assertThat(management.revealPhone(actor, property.getId(), id)).isEqualTo("+821012345678");
        assertThat(management.detail(actor, property.getId(), id).updatedAt()).isEqualTo(updated.updatedAt());
        // 저장 응답의 시각을 그대로 사용한 다음 수정도 새로고침 없이 성공해야 합니다.
        var again = management.update(actor, property.getId(), id,
            new com.moahome.server.resident.dto.ResidentUpdateRequest("연속 수정 주민", unit.getId(), "OWNER", "KEEP", null, null, updated.updatedAt()));
        assertThat(again.name()).isEqualTo("연속 수정 주민");
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
        @Bean tools.jackson.databind.ObjectMapper objectMapper() { return new tools.jackson.databind.ObjectMapper(); }
		@Bean com.moahome.server.common.security.PhoneSecurity phoneSecurity() {
            var random = new java.security.SecureRandom();
            var encryption = new byte[32];
            var hmac = new byte[32];
            random.nextBytes(encryption);
            random.nextBytes(hmac);
            return new com.moahome.server.common.security.PhoneSecurity(new com.moahome.server.config.PhoneSecurityProperties("v1",
                Map.of("v1", Base64.getEncoder().encodeToString(encryption)), Base64.getEncoder().encodeToString(hmac)));
        }
        @Bean java.time.Clock clock() { return java.time.Clock.systemUTC(); }
	}
}
