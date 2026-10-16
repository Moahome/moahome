package com.moahome.server.billing.repo;

import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.support.MutableClock;
import com.moahome.server.billing.dto.BillingSettingsRequest;
import com.moahome.server.billing.exception.BillingException;
import com.moahome.server.billing.service.*;
import com.moahome.server.common.security.AccountNumberSecurity;
import com.moahome.server.property.dto.PropertyRegistrationRequest.UnitInput;
import com.moahome.server.property.service.*;
import com.moahome.server.property.support.*;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.property.repo.PropertyRegistrationLock;
import com.moahome.server.user.domain.User;
import com.moahome.server.user.repo.UserRepository;
import com.moahome.server.user.service.UserService;
import com.moahome.server.user.support.PostgresTestServer;
import jakarta.validation.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(FlywayAutoConfiguration.class)
@Import({com.moahome.server.payment.service.CumulativePaymentService.class,BillingService.class, BillingTemplates.class, BillingGenerationService.class,
    PropertyRegistrationService.class, PropertyRegistrationLock.class, ManagementAccessService.class,
    UnitManagementService.class, com.moahome.server.resident.service.ResidentManagementService.class,
    com.moahome.server.resident.service.ResidentRegistrationService.class,
    UserService.class, com.moahome.server.resident.service.ResidentListService.class, BillingPersistenceTest.TestBeans.class})
@ActiveProfiles("database-test")
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class BillingPersistenceTest {
    private static final PostgresTestServer POSTGRES = new PostgresTestServer();
    @Autowired BillingService billing;
    @Autowired BillingGenerationService generation;
    @Autowired UnitManagementService unitManagement;
    @Autowired com.moahome.server.resident.service.ResidentListService residentLists;
    @Autowired PropertyRegistrationService registration;
    @Autowired PropertyRepository properties;
    @Autowired UserRepository users;
    @Autowired MutableClock clock;
    @Autowired JdbcTemplate jdbc;
    private UUID userId;
    private UUID propertyId;
    @DynamicPropertySource
    static void infrastructure(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::jdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::username);
        registry.add("spring.datasource.password", () -> "");
    }
    @BeforeEach
    void prepare() {
        clock.set(Instant.parse("2026-10-10T00:00:00Z"));
        userId = users.saveAndFlush(User.create("관리자", null)).getId();
        var request = RegistrationFixtures.withUnits(RegistrationFixtures.request(UUID.randomUUID(), true), List.of(
            new UnitInput("a", "201", "기존 별칭", 2, "ACTIVE"),
            new UnitInput("a", "202", null, 2, "ACTIVE"),
            new UnitInput("b", "301", null, 3, "ACTIVE"),
            new UnitInput("b", "302", null, 3, "ACTIVE")));
        propertyId = registration.register(userId, request).response().property().id();
        jdbc.update("update units set status='INACTIVE' where property_id=? and unit_number='301'", propertyId);
        jdbc.update("update units set deleted_at=now() where property_id=? and unit_number='302'", propertyId);
    }
    @AfterEach
    void cleanup() {
        jdbc.execute("drop function if exists fail_billing() cascade");
        jdbc.execute("drop function if exists fail_cancellation() cascade");
        jdbc.execute("truncate charge_items, charges, billing_periods, property_registration_results, property_members, "
            + "fee_template_items, fee_templates, bank_accounts, units, buildings, properties, social_accounts, users cascade");
    }
    @AfterAll static void stopPostgres() { POSTGRES.close(); }

    /** 과거 등록의 처리자를 필수로 보존하고 자동 부과에 수동 처리자를 섞지 않습니다. */
    @Test
    void historicalBillingRequiresActorAndLeavesScheduledPeriodsUntouched() {
        String insert="insert into billing_periods(id,property_id,billing_year,billing_month,billing_date,default_due_date,status,confirmation_source,recorded_by,confirmed_at,created_at,updated_at) values(?,?,2026,8,date '2026-08-01',date '2026-08-31','ISSUED',?,?,now(),now(),now())";
        assertThatThrownBy(()->jdbc.update(insert,UUID.randomUUID(),propertyId,"HISTORY",null)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(()->jdbc.update(insert,UUID.randomUUID(),propertyId,"SCHEDULE",userId)).isInstanceOf(DataIntegrityViolationException.class);
        UUID period=UUID.randomUUID();
        jdbc.update(insert,period,propertyId,"HISTORY",userId);
        assertThat(jdbc.queryForObject("select recorded_by from billing_periods where id=?",UUID.class,period)).isEqualTo(userId);
        assertThat(jdbc.queryForObject("select count(*) from billing_periods where property_id=? and confirmation_source='SCHEDULE' and recorded_by is null",Long.class,propertyId)).isEqualTo(1);
    }

    @Test
    void registrationIssuesCurrentMonthImmediatelyAndNextMonthIncludesActiveOnly() {
        var settings = billing.settings(userId, propertyId);
        assertThat(settings.firstBillingMonth()).isEqualTo("2026-10");
        var initial = billing.monthly(userId, propertyId, YearMonth.of(2026, 10));
        assertThat(initial.status()).isEqualTo("ISSUED");
        assertThat(initial.charges()).hasSize(2);
        assertThat(initial.billingDate()).isEqualTo(LocalDate.of(2026, 10, 1));
        assertThat(initial.dueDate()).isEqualTo(LocalDate.of(2026, 10, 31));
        assertThat(billing.history(userId, propertyId).periods()).hasSize(1);
        assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 9)).status()).isEqualTo("NOT_BILLED");
        assertThat(generation.generate(propertyId, YearMonth.of(2026, 9))).isFalse();
        assertThat(generation.generate(propertyId, YearMonth.of(2026, 10))).isFalse();
        clock.set(Instant.parse("2026-10-31T14:59:59Z"));
        assertThat(generation.generate(propertyId, YearMonth.of(2026, 11))).isFalse();
        clock.set(Instant.parse("2026-10-31T15:00:00Z"));
        assertThat(generation.generate(propertyId, YearMonth.of(2026, 11))).isTrue();
        var month = billing.monthly(userId, propertyId, YearMonth.of(2026, 11));
        assertThat(month.status()).isEqualTo("ISSUED");
        assertThat(month.billingDate()).isEqualTo(LocalDate.of(2026, 11, 1));
        assertThat(month.dueDate()).isEqualTo(LocalDate.of(2026, 11, 30));
        assertThat(month.charges()).extracting(row -> row.room()).containsExactlyInAnyOrder("201", "202");
        assertThat(billing.history(userId, propertyId).periods().getFirst().totalAmount()).isEqualTo("100000");
        assertThat(generation.generate(propertyId, YearMonth.of(2026, 11))).isFalse();
        assertThat(count("charges")).isEqualTo(6);
        assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 10)).charges()).containsAll(initial.charges()).hasSize(4);
    }

    @Test
    void representativeNamesFollowCurrentDirectoryWithoutChangingIssuedSnapshots() {
        UUID unitId = jdbc.queryForObject("select id from units where property_id=? and unit_number='201'", UUID.class, propertyId);
        UUID vacantId = jdbc.queryForObject("select id from units where property_id=? and unit_number='202'", UUID.class, propertyId);
        UUID representative = addResident(unitId, "현재 대표", true);
        addResident(unitId, "다른 구성원", false);
        UUID departed = addResident(vacantId, "이전 대표", true);
        jdbc.update("update unit_residents set status='MOVED_OUT' where resident_id=?", departed);
        var issued = billing.monthly(userId, propertyId, YearMonth.of(2026, 10));
        assertThat(issued.hasBuildings()).isTrue();
        var original = issued.charges().stream().filter(row -> row.unitId().equals(unitId)).findFirst().orElseThrow();
        assertThat(original.representativeName()).isEqualTo("현재 대표");
        assertThat(issued.charges().stream().filter(row -> row.unitId().equals(vacantId)).findFirst().orElseThrow().representativeName()).isNull();
        assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 11)).charges())
            .filteredOn(row -> row.unitId().equals(unitId)).extracting(row -> row.representativeName()).containsExactly("현재 대표");
        assertThat(billing.detail(userId, propertyId, YearMonth.of(2026, 10), unitId).charges().getFirst().representativeName()).isEqualTo("현재 대표");
        jdbc.update("update residents set name='변경된 이름' where id=?", representative);
        var renamed = billing.detail(userId, propertyId, YearMonth.of(2026, 10), unitId).charges().getFirst();
        assertThat(renamed.representativeName()).isEqualTo("변경된 이름");
        assertThat(renamed.items()).isEqualTo(original.items());
        jdbc.update("update residents set deleted_at=now() where id=?", representative);
        assertThat(billing.detail(userId, propertyId, YearMonth.of(2026, 10), unitId).charges().getFirst().representativeName()).isNull();
    }

    @Test
    void managerCannotReadRepresentativeNamesAndNoBuildingPropertyRemainsIdentifiable() {
        UUID unitId = jdbc.queryForObject("select id from units where property_id=? and unit_number='201'", UUID.class, propertyId);
        addResident(unitId, "관리소장 전용 대표 정보", true);
        assertThat(billing.detail(userId, propertyId, YearMonth.of(2026, 10), unitId).charges().getFirst().representativeName())
            .isEqualTo("관리소장 전용 대표 정보");
        jdbc.update("update property_members set role='MANAGER' where property_id=? and user_id=?", propertyId, userId);
        assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 10)).charges()).allMatch(row -> row.representativeName() == null);
        assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 11)).charges()).allMatch(row -> row.representativeName() == null);
        UUID other = registration.register(userId, RegistrationFixtures.request(UUID.randomUUID(), false)).response().property().id();
        var noBuildings = billing.monthly(userId, other, YearMonth.of(2026, 10));
        assertThat(noBuildings.hasBuildings()).isFalse();
        assertThat(noBuildings.charges()).allMatch(row -> row.building().isEmpty() && row.representativeName() == null);
    }

    @Test
    void singleAndBatchAdditionsIssueCurrentMonthFullAmountWithoutResidentsAndKeepExistingSnapshots() {
        var october = billing.monthly(userId, propertyId, YearMonth.of(2026, 10));
        var settings = billing.settings(userId, propertyId);
        billing.saveSettings(userId, propertyId, request(settings.revisionId(), "2026-11", "다음 달 변경", 999));
        var buildingId = buildingId("201");
        var first = unitManagement.create(userId, propertyId, unitRequest(buildingId, "701", "ACTIVE"));
        var batch = unitManagement.createBatch(userId, propertyId, new com.moahome.server.property.dto.UnitBatchRequest(List.of(
            unitRequest(buildingId, "702", "VACANT"), unitRequest(buildingId, "703", "ACTIVE"))));
        generation.addCurrentMonthUnits(propertyId, List.of(first.id()));
        var month = billing.monthly(userId, propertyId, YearMonth.of(2026, 10));
        assertThat(month.charges()).hasSize(4).containsAll(october.charges());
        assertThat(month.charges()).filteredOn(row -> List.of("701", "703").contains(row.room()))
            .allSatisfy(row -> {
                assertThat(row.representativeName()).isNull();
                assertThat(row.items()).extracting(item -> item.amount()).containsExactly("15000", "8000", "25300", "1700");
            });
        assertThat(batch).hasSize(2);
        assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 11)).charges())
            .filteredOn(row -> row.unitId().equals(first.id())).singleElement()
            .satisfies(row -> assertThat(row.items()).extracting(item -> item.amount()).containsExactly("999"));
        assertThat(residentLists.list(userId, propertyId).residents()).isEmpty();
    }

    @Test
    void schedulerSupplementsLegacyMissingCurrentMonthUnitsOnceWithoutChangingIssuedOrPastSnapshots() {
        var october = billing.monthly(userId, propertyId, YearMonth.of(2026, 10));
        var buildingId = buildingId("201");
        var legacyUnit = UUID.randomUUID();
        // 이전 구현처럼 세대만 저장되어 당월 청구가 빠진 상태를 재현합니다.
        jdbc.update("insert into units(id,property_id,building_id,unit_number,status,created_at,updated_at) "
            + "values (?,?,?,'701','ACTIVE',now(),now())", legacyUnit, propertyId, buildingId);
        var settings = billing.settings(userId, propertyId);
        billing.saveSettings(userId, propertyId, request(settings.revisionId(), "2026-11", "다음 달 변경", 999));
        var scheduler = new BillingScheduler(properties, generation, clock);
        scheduler.runDueBilling();
        scheduler.runDueBilling();
        var current = billing.monthly(userId, propertyId, YearMonth.of(2026, 10));
        assertThat(current.charges()).hasSize(3).containsAll(october.charges());
        assertThat(current.charges()).filteredOn(row -> row.unitId().equals(legacyUnit)).singleElement()
            .satisfies(row -> assertThat(row.items()).extracting(item -> item.amount())
                .containsExactly("15000", "8000", "25300", "1700"));
        unitManagement.deleteUnits(userId, propertyId, List.of(legacyUnit));
        scheduler.runDueBilling();
        assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 10))).isEqualTo(october);
        assertThat(count("charges")).isEqualTo(5);
        assertThat(residentLists.list(userId, propertyId).residents()).isEmpty();
    }

    @Test
    void buildingDeletionRemovesAllCurrentResidentsAccessAndPendingRequestsButKeepsOtherBuildingAndPastCharges() {
        var firstUnit = unitId("201");
        var secondUnit = unitId("202");
        var buildingId = buildingId("201");
        var representative = addResident(firstUnit, "삭제할 대표", true);
        addResident(firstUnit, "삭제할 가족", false);
        addResident(secondUnit, "삭제할 공실 주민", true);
        var retained = addResident(unitId("301"), "다른 동 주민", true);
        // 과거에 대상 동에 살았어도 현재 다른 동에 소속된 주민은 삭제하지 않습니다.
        jdbc.update("insert into unit_residents(id,property_id,resident_id,unit_id,relation_type,status,is_household_rep,created_at,updated_at) "
            + "values (?,?,?,?,'OTHER','MOVED_OUT',false,now(),now())", UUID.randomUUID(), propertyId, retained, firstUnit);
        var residentUser = users.saveAndFlush(User.create("주민 로그인 계정", null)).getId();
        jdbc.update("update residents set user_id=? where id=?", residentUser, representative);
        addMember(propertyId, residentUser, "RESIDENT");
        var other = registration.register(userId, RegistrationFixtures.request(UUID.randomUUID(), false)).response().property().id();
        addMember(other, residentUser, "RESIDENT");
        var approved = addRequest(firstUnit, residentUser, representative, "APPROVED");
        var pending = addRequest(firstUnit, residentUser, representative, "PENDING");
        var unmatched = addRequest(secondUnit, users.saveAndFlush(User.create("미확인 신청", null)).getId(), null, "PENDING");
        var otherPending = addRequest(unitId("301"), users.saveAndFlush(User.create("다른 동 신청", null)).getId(), retained, "PENDING");
        var retainedUnit = unitManagement.create(userId, propertyId, unitRequest(buildingId("301"), "303", "ACTIVE"));
        var october = billing.monthly(userId, propertyId, YearMonth.of(2026, 10));
        clock.set(Instant.parse("2026-11-10T00:00:00Z"));
        generation.generate(propertyId, YearMonth.of(2026, 11));
        unitManagement.deleteBuilding(userId, propertyId, buildingId);
        var canceledAt = jdbc.queryForObject("select canceled_at from charges where unit_id=? and status='CANCELED'", OffsetDateTime.class, firstUnit);
        unitManagement.deleteBuilding(userId, propertyId, buildingId);
        assertThat(residentLists.list(userId, propertyId).residents()).extracting(row -> row.id()).containsExactly(retained);
        assertThat(jdbc.queryForObject("select count(*) from unit_residents where property_id=? and unit_id in (?,?) and status='ACTIVE' and deleted_at is null", Long.class, propertyId, firstUnit, secondUnit)).isZero();
        assertThat(jdbc.queryForObject("select status from property_members where property_id=? and user_id=?", String.class, propertyId, residentUser)).isEqualTo("INACTIVE");
        assertThat(jdbc.queryForObject("select status from property_members where property_id=? and user_id=?", String.class, other, residentUser)).isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject("select status from property_members where property_id=? and user_id=?", String.class, propertyId, userId)).isEqualTo("ACTIVE");
        for (var id : List.of(pending, unmatched)) assertThat(jdbc.queryForObject("select status from membership_requests where id=?", String.class, id)).isEqualTo("CANCELED");
        assertThat(jdbc.queryForObject("select status from membership_requests where id=?", String.class, approved)).isEqualTo("APPROVED");
        assertThat(jdbc.queryForObject("select status from membership_requests where id=?", String.class, otherPending)).isEqualTo("PENDING");
        assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 11)).charges()).extracting(row -> row.unitId()).containsExactly(retainedUnit.id());
        assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 12)).charges()).extracting(row -> row.unitId()).containsExactly(retainedUnit.id());
        assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 10)).charges()).extracting(row -> row.id(), row -> row.items())
            .containsAll(october.charges().stream().map(row -> tuple(row.id(), row.items())).toList()).hasSize(october.charges().size() + 2);
        assertThat(jdbc.queryForObject("select canceled_at from charges where unit_id=? and status='CANCELED'", OffsetDateTime.class, firstUnit)).isEqualTo(canceledAt);
        assertThat(jdbc.queryForObject("select count(*) from charges where property_id=? and status='CANCELED' and canceled_by=? and cancellation_reason='UNIT_DELETED'", Long.class, propertyId, userId)).isEqualTo(2);
    }

    @Test
    void unitBatchDeletionAndCancellationFailureAreAtomicAndRetryable() {
        var selected = List.of(unitId("201"), unitId("202"));
        var resident = addResident(selected.getFirst(), "롤백할 주민", true);
        jdbc.execute("create function fail_cancellation() returns trigger language plpgsql as $$ begin raise exception 'test'; end; $$");
        jdbc.execute("create trigger fail_cancellation before update on charges for each row when (new.status='CANCELED') execute function fail_cancellation()");
        assertThatThrownBy(() -> unitManagement.deleteUnits(userId, propertyId, selected)).isInstanceOf(RuntimeException.class);
        assertThat(jdbc.queryForObject("select deleted_at from residents where id=?", OffsetDateTime.class, resident)).isNull();
        assertThat(jdbc.queryForObject("select status from unit_residents where resident_id=?", String.class, resident)).isEqualTo("ACTIVE");
        assertThat(unitManagement.list(userId, propertyId).units()).extracting(row -> row.id()).containsAll(selected);
        assertThat(count("charges")).isEqualTo(4);
        jdbc.execute("drop function fail_cancellation() cascade");
        unitManagement.deleteUnits(userId, propertyId, selected);
        unitManagement.deleteUnits(userId, propertyId, selected);
        assertThat(residentLists.list(userId, propertyId).residents()).isEmpty();
        assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 10)).charges()).extracting(row -> row.unitId()).doesNotContainAnyElementsOf(selected);
        assertThat(jdbc.queryForObject("select count(*) from charges where status='CANCELED'", Long.class)).isEqualTo(2);
    }

    @Test
    void supplementFailureRollsBackSingleAndBatchUnitsAndConcurrentSchedulerDoesNotDuplicateCharges() throws Exception {
        var buildingId = buildingId("201");
        jdbc.execute("create function fail_billing() returns trigger language plpgsql as $$ begin raise exception 'test'; end; $$");
        jdbc.execute("create trigger fail_billing before insert on charge_items for each row execute function fail_billing()");
        assertThatThrownBy(() -> unitManagement.create(userId, propertyId, unitRequest(buildingId, "711", "ACTIVE"))).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> unitManagement.createBatch(userId, propertyId, new com.moahome.server.property.dto.UnitBatchRequest(List.of(
            unitRequest(buildingId, "712", "ACTIVE"), unitRequest(buildingId, "713", "VACANT"))))).isInstanceOf(RuntimeException.class);
        assertThat(jdbc.queryForObject("select count(*) from units where property_id=? and unit_number in ('711','712','713')", Long.class, propertyId)).isZero();
        assertThat(count("charges")).isEqualTo(4);
        jdbc.execute("drop function fail_billing() cascade");
        clock.set(Instant.parse("2026-10-31T15:00:00Z"));
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var create = executor.submit(() -> { start.await(); return unitManagement.create(userId, propertyId, unitRequest(buildingId, "711", "ACTIVE")); });
            var scheduled = executor.submit(() -> { start.await(); return generation.generate(propertyId, YearMonth.of(2026, 11)); });
            start.countDown();
            var added = create.get(10, TimeUnit.SECONDS);
            scheduled.get(10, TimeUnit.SECONDS);
            assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 11)).charges()).extracting(row -> row.unitId())
                .containsOnlyOnce(added.id()).hasSize(3);
        }
    }

    @Test
    void concurrentRecreationOfDeletedNumberAllowsOnlyOneCurrentUnitAndCharge() throws Exception {
        var input = unitRequest(buildingId("201"), "701", "ACTIVE");
        var deleted = unitManagement.create(userId, propertyId, input);
        unitManagement.deleteUnits(userId, propertyId, List.of(deleted.id()));
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var tasks = java.util.stream.IntStream.range(0, 2).mapToObj(index -> executor.submit(() -> {
                start.await();
                try {
                    unitManagement.create(userId, propertyId, input);
                    return "CREATED";
                } catch (com.moahome.server.property.exception.UnitManagementException exception) {
                    return exception.code().name();
                }
            })).toList();
            start.countDown();
            var outcomes = new ArrayList<String>();
            for (var task : tasks) outcomes.add(task.get(10, TimeUnit.SECONDS));
            assertThat(outcomes).containsExactlyInAnyOrder("CREATED", "DUPLICATE_UNIT");
        }
        assertThat(unitManagement.list(userId, propertyId).units()).filteredOn(unit -> unit.unitNumber().equals("701")).hasSize(1);
        assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 10)).charges()).filteredOn(row -> row.room().equals("701")).hasSize(1);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void deletedUnitNumberCanBeAddedAgainWithFreshBillingWithoutRevivingOldResidentsOrPastCharges(boolean hasBuildings) {
        var target = registration.register(userId, RegistrationFixtures.request(UUID.randomUUID(), hasBuildings)).response().property().id();
        var building = hasBuildings ? jdbc.queryForObject("select id from buildings where property_id=? and name='101동'", UUID.class, target) : null;
        var input = unitRequest(building, "701", "ACTIVE");
        var old = unitManagement.create(userId, target, input);
        var past = billing.monthly(userId, target, YearMonth.of(2026, 10));
        var previousResident = UUID.randomUUID();
        jdbc.update("insert into residents(id,property_id,name,status,created_at,updated_at) values (?,?,'이전 주민','ACTIVE',now(),now())", previousResident, target);
        jdbc.update("insert into unit_residents(id,property_id,resident_id,unit_id,relation_type,status,is_household_rep,created_at,updated_at) "
            + "values (?,?,?,?,'TENANT','ACTIVE',true,now(),now())", UUID.randomUUID(), target, previousResident, old.id());
        clock.set(Instant.parse("2026-11-10T00:00:00Z"));
        generation.generate(target, YearMonth.of(2026, 11));
        unitManagement.deleteUnits(userId, target, List.of(old.id()));
        var deletedRow = jdbc.queryForList("select * from units where id=?", old.id());
        var canceled = jdbc.queryForList("select * from charges where unit_id=? and status='CANCELED'", old.id());
        var replacement = unitManagement.create(userId, target, input);
        assertThat(replacement.id()).isNotEqualTo(old.id());
        assertThat(residentLists.list(userId, target).residents()).isEmpty();
        assertThat(jdbc.queryForObject("select count(*) from unit_residents where unit_id=?", Long.class, replacement.id())).isZero();
        assertThat(unitManagement.list(userId, target).units()).filteredOn(unit -> unit.unitNumber().equals("701"))
            .extracting(unit -> unit.id()).containsExactly(replacement.id());
        var current = billing.monthly(userId, target, YearMonth.of(2026, 11));
        assertThat(current.charges()).filteredOn(row -> row.room().equals("701")).singleElement().satisfies(row -> {
            assertThat(row.unitId()).isEqualTo(replacement.id());
            assertThat(row.representativeName()).isNull();
            assertThat(row.items()).extracting(item -> item.amount()).containsExactly("15000", "8000", "25300", "1700");
        });
        // 예전 삭제 요청의 재시도도 같은 호수의 새 세대·청구에는 영향을 주지 않습니다.
        unitManagement.deleteUnits(userId, target, List.of(old.id()));
        generation.supplementCurrentMonth(target);
        assertThat(billing.monthly(userId, target, YearMonth.of(2026, 11))).isEqualTo(current);
        assertThat(billing.monthly(userId, target, YearMonth.of(2026, 10))).isEqualTo(past);
        assertThat(jdbc.queryForList("select * from units where id=?", old.id())).isEqualTo(deletedRow);
        assertThat(jdbc.queryForList("select * from charges where unit_id=? and status='CANCELED'", old.id())).isEqualTo(canceled);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void batchAndUpdateCanReuseDeletedNumbersButRejectExistingUnitsAndInRequestDuplicates(boolean hasBuildings) {
        var target = registration.register(userId, RegistrationFixtures.request(UUID.randomUUID(), hasBuildings)).response().property().id();
        var building = hasBuildings ? jdbc.queryForObject("select id from buildings where property_id=? and name='101동'", UUID.class, target) : null;
        var inputs = List.of(unitRequest(building, "701", "ACTIVE"), unitRequest(building, "702", "VACANT"));
        var original = unitManagement.createBatch(userId, target, new com.moahome.server.property.dto.UnitBatchRequest(inputs));
        unitManagement.deleteUnits(userId, target, original.stream().map(unit -> unit.id()).toList());
        var replacement = unitManagement.createBatch(userId, target, new com.moahome.server.property.dto.UnitBatchRequest(inputs));
        assertThat(replacement).extracting(unit -> unit.id()).doesNotContainAnyElementsOf(original.stream().map(unit -> unit.id()).toList());
        assertThat(billing.monthly(userId, target, YearMonth.of(2026, 10)).charges()).filteredOn(row -> row.room().equals("701")).hasSize(1);
        assertThat(billing.monthly(userId, target, YearMonth.of(2026, 10)).charges()).noneMatch(row -> row.room().equals("702"));
        var editing = unitManagement.create(userId, target, unitRequest(building, "703", "ACTIVE"));
        assertThatThrownBy(() -> unitManagement.update(userId, target, editing.id(), inputs.getFirst()))
            .isInstanceOf(com.moahome.server.property.exception.UnitManagementException.class);
        var before = unitManagement.list(userId, target).units();
        var conflicting = new com.moahome.server.property.dto.UnitBatchRequest(List.of(unitRequest(building, "704", "ACTIVE"), inputs.getFirst()));
        assertThatThrownBy(() -> unitManagement.createBatch(userId, target, conflicting))
            .isInstanceOf(com.moahome.server.property.exception.UnitManagementException.class);
        var duplicate = unitRequest(building, "705", "ACTIVE");
        assertThatThrownBy(() -> unitManagement.createBatch(userId, target, new com.moahome.server.property.dto.UnitBatchRequest(List.of(duplicate, duplicate))))
            .isInstanceOf(com.moahome.server.property.exception.UnitManagementException.class);
        assertThat(unitManagement.list(userId, target).units()).isEqualTo(before);
        unitManagement.deleteUnits(userId, target, List.of(replacement.getFirst().id()));
        var updated = unitManagement.update(userId, target, editing.id(), inputs.getFirst());
        assertThat(updated.id()).isEqualTo(editing.id());
        assertThat(updated.unitNumber()).isEqualTo("701");
        assertThat(unitManagement.list(userId, target).units()).filteredOn(unit -> unit.unitNumber().equals("701")).hasSize(1);
    }

    @Test
    void unitNumberReuseMigrationPreservesExistingRowsAndChargeLinksAndRestrictsOnlyUndeletedNumbers() {
        var withoutBuildings = registration.register(userId, RegistrationFixtures.request(UUID.randomUUID(), false)).response().property().id();
        String schema = "unit_reuse_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        var previous = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
            .schemas(schema).defaultSchema(schema).target("20261012061303").load();
        previous.migrate();
        for (String table : List.of("users", "properties", "buildings", "units", "fee_templates", "fee_template_items", "billing_periods", "charges", "charge_items")) {
            copyPreviousTable(schema,table);
        }
        jdbc.update("update " + schema + ".units set deleted_at=now(),deleted_by=? where unit_number='201'", userId);
        var storedUnits = jdbc.queryForList("select * from " + schema + ".units order by id");
        var storedCharges = jdbc.queryForList("select * from " + schema + ".charges order by id");
        var storedItems = jdbc.queryForList("select * from " + schema + ".charge_items order by id");
        var upgraded = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
            .schemas(schema).defaultSchema(schema).load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(6);
        upgraded.validate();
        assertThat(jdbc.queryForList("select * from " + schema + ".units order by id")).isEqualTo(storedUnits);
        assertThat(jdbc.queryForList("select * from " + schema + ".charges order by id")).isEqualTo(storedCharges);
        assertThat(jdbc.queryForList("select * from " + schema + ".charge_items order by id")).isEqualTo(storedItems);
        for (var target : List.of(propertyId, withoutBuildings)) {
            UUID oldUnit = jdbc.queryForObject("select id from " + schema + ".units where property_id=? and unit_number='201'", UUID.class, target);
            String insert = "insert into " + schema + ".units(id,property_id,building_id,unit_number,status,created_at,updated_at) "
                + "select ?,property_id,building_id,unit_number,'ACTIVE',now(),now() from " + schema + ".units where id=?";
            UUID replacement = UUID.randomUUID();
            jdbc.update(insert, replacement, oldUnit);
            assertThatThrownBy(() -> jdbc.update(insert, UUID.randomUUID(), oldUnit)).isInstanceOf(DataIntegrityViolationException.class);
            jdbc.update("update " + schema + ".units set deleted_at=now(),deleted_by=? where id=?", userId, replacement);
            jdbc.update(insert, UUID.randomUUID(), oldUnit);
            assertThat(jdbc.queryForObject("select count(*) from " + schema + ".units where property_id=? and unit_number='201' and deleted_at is null", Long.class, target)).isEqualTo(1);
        }
    }

    @Test
    void vacantUnitsAreExcludedAndStatusChangesSynchronizeCurrentChargesWithoutDuplicatesOrManualRevival() {
        var buildingId = buildingId("201");
        var vacant = unitManagement.create(userId, propertyId, unitRequest(buildingId, "801", "VACANT"));
        assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 10)).charges()).noneMatch(row -> row.unitId().equals(vacant.id()));
        assertThat(jdbc.queryForObject("select count(*) from charges where unit_id=?", Long.class, vacant.id())).isZero();
        unitManagement.update(userId, propertyId, vacant.id(), unitRequest(buildingId, "801", "ACTIVE"));
        var original = billing.detail(userId, propertyId, YearMonth.of(2026, 10), vacant.id()).charges().getFirst();
        assertThat(original.items()).extracting(item -> item.amount()).containsExactly("15000", "8000", "25300", "1700");
        unitManagement.update(userId, propertyId, vacant.id(), unitRequest(buildingId, "801", "VACANT"));
        assertThat(jdbc.queryForObject("select status from charges where id=?", String.class, original.id())).isEqualTo("EXCLUDED_VACANT");
        generation.supplementCurrentMonth(propertyId);
        assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 11)).charges()).noneMatch(row -> row.unitId().equals(vacant.id()));
        unitManagement.update(userId, propertyId, vacant.id(), unitRequest(buildingId, "801", "ACTIVE"));
        assertThat(billing.detail(userId, propertyId, YearMonth.of(2026, 10), vacant.id()).charges()).containsExactly(original);
        billing.cancelCharge(userId, propertyId, YearMonth.of(2026, 10), original.id());
        unitManagement.update(userId, propertyId, vacant.id(), unitRequest(buildingId, "801", "VACANT"));
        unitManagement.update(userId, propertyId, vacant.id(), unitRequest(buildingId, "801", "ACTIVE"));
        generation.supplementCurrentMonth(propertyId);
        assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 10)).charges()).noneMatch(row -> row.unitId().equals(vacant.id()));
        assertThat(jdbc.queryForObject("select count(*) from charges where unit_id=?", Long.class, vacant.id())).isEqualTo(1);
        assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 11)).charges()).anyMatch(row -> row.unitId().equals(vacant.id()));
    }

    @Test
    void deletedBuildingRecreationCountsOnlyNewTargetsAndRepairsLegacyChargesWithoutTouchingPast() {
        var request = RegistrationFixtures.withUnits(RegistrationFixtures.request(UUID.randomUUID(), true),
            java.util.stream.IntStream.range(0, 31).mapToObj(index -> new UnitInput(index < 15 ? "a" : "b",
                String.valueOf(101 + index), null, 1, "ACTIVE")).toList());
        var target = registration.register(userId, request).response().property().id();
        var oldBuilding = jdbc.queryForObject("select id from buildings where property_id=? and name='102동'", UUID.class, target);
        var original = billing.monthly(userId, target, YearMonth.of(2026, 10));
        clock.set(Instant.parse("2026-11-10T00:00:00Z"));
        generation.generate(target, YearMonth.of(2026, 11));
        // 이전 구현처럼 동·세대만 삭제되고 청구가 남은 상태를 재현합니다.
        jdbc.update("update buildings set deleted_at=now(),deleted_by=? where id=?", userId, oldBuilding);
        jdbc.update("update units set deleted_at=now(),deleted_by=? where building_id=?", userId, oldBuilding);
        assertThat(billing.monthly(userId, target, YearMonth.of(2026, 11)).charges()).hasSize(15);
        var replacement = unitManagement.createBuilding(userId, target, new com.moahome.server.property.dto.BuildingRequest("102동"));
        unitManagement.createBatch(userId, target, new com.moahome.server.property.dto.UnitBatchRequest(
            java.util.stream.IntStream.range(15, 31).mapToObj(index -> unitRequest(replacement.id(), String.valueOf(101 + index), "ACTIVE")).toList()));
        generation.supplementCurrentMonth(target);
        var current = billing.monthly(userId, target, YearMonth.of(2026, 11));
        assertThat(current.charges()).hasSize(31);
        assertThat(current.charges()).extracting(row -> row.building() + "/" + row.room()).doesNotHaveDuplicates();
        assertThat(billing.history(userId, target).periods().getFirst().unitCount()).isEqualTo(31);
        assertThat(jdbc.queryForObject("select count(*) from charges where property_id=? and status='CANCELED'", Long.class, target)).isEqualTo(16);
        assertThat(billing.monthly(userId, target, YearMonth.of(2026, 10))).isEqualTo(original);
    }

    @Test
    void manualCancellationIsScopedAtomicRetryableAndDoesNotDeleteUnitOrChangeNextMonth() {
        var month = YearMonth.of(2026, 10);
        var charge = billing.detail(userId, propertyId, month, unitId("201")).charges().getFirst();
        var originalItems = jdbc.queryForList("select * from charge_items where charge_id=? order by id", charge.id());
        var stranger = users.saveAndFlush(User.create("다른 계정", null)).getId();
        assertThatThrownBy(() -> billing.cancelCharge(stranger, propertyId, month, charge.id())).isInstanceOf(AuthException.class);
        var other = registration.register(userId, RegistrationFixtures.request(UUID.randomUUID(), false)).response().property().id();
        assertThatThrownBy(() -> billing.cancelCharge(userId, other, month, charge.id())).isInstanceOf(BillingException.class);
        jdbc.execute("create function fail_cancellation() returns trigger language plpgsql as $$ begin raise exception 'test'; end; $$");
        jdbc.execute("create trigger fail_cancellation before update on charges for each row when (new.status='CANCELED') execute function fail_cancellation()");
        assertThatThrownBy(() -> billing.cancelCharge(userId, propertyId, month, charge.id())).isInstanceOf(RuntimeException.class);
        assertThat(billing.detail(userId, propertyId, month, charge.unitId()).charges()).containsExactly(charge);
        jdbc.execute("drop function fail_cancellation() cascade");
        billing.cancelCharge(userId, propertyId, month, charge.id());
        var audit = jdbc.queryForList("select canceled_at,canceled_by,cancellation_reason from charges where id=?", charge.id());
        billing.cancelCharge(userId, propertyId, month, charge.id());
        generation.supplementCurrentMonth(propertyId);
        assertThat(jdbc.queryForList("select canceled_at,canceled_by,cancellation_reason from charges where id=?", charge.id())).isEqualTo(audit);
        assertThat(jdbc.queryForObject("select cancellation_reason from charges where id=?", String.class, charge.id())).isEqualTo("MANUAL_CANCELED");
        assertThat(jdbc.queryForList("select * from charge_items where charge_id=? order by id", charge.id())).isEqualTo(originalItems);
        assertThat(billing.monthly(userId, propertyId, month).charges()).noneMatch(row -> row.id().equals(charge.id()));
        assertThat(billing.history(userId, propertyId).periods().getFirst().unitCount()).isEqualTo(1);
        assertThat(unitManagement.list(userId, propertyId).units()).anyMatch(unit -> unit.id().equals(charge.unitId()));
        assertThat(billing.monthly(userId, propertyId, month.plusMonths(1)).charges()).anyMatch(row -> row.unitId().equals(charge.unitId()));
        clock.set(Instant.parse("2026-11-10T00:00:00Z"));
        assertThatThrownBy(() -> billing.cancelCharge(userId, propertyId, month, charge.id())).isInstanceOf(BillingException.class)
            .hasMessage(BillingException.Code.BILLING_CANCELLATION_NOT_ALLOWED.message);
    }

    @Test
    void cancellationMigrationPreservesExistingIssuedHeadersAndItemsAndEnforcesCompleteAudit() {
        String schema = "charge_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        var old = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
            .schemas(schema).defaultSchema(schema).target("20261010131153").load();
        old.migrate();
        for (String table : List.of("users", "properties", "buildings", "units", "fee_templates", "fee_template_items", "billing_periods")) {
            copyPreviousTable(schema,table);
        }
        String originalColumns = "id,property_id,billing_period_id,unit_id,building_name_snapshot,unit_number_snapshot,unit_display_name_snapshot,total_amount,due_date,status,issued_at,created_at,updated_at";
        jdbc.execute("insert into " + schema + ".charges select " + originalColumns + " from public.charges");
        jdbc.execute("insert into " + schema + ".charge_items select * from public.charge_items");
        var original = jdbc.queryForList("select " + originalColumns + " from public.charges order by id");
        var upgraded = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
            .schemas(schema).defaultSchema(schema).load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(9);
        upgraded.validate();
        assertThat(jdbc.queryForList("select " + originalColumns + " from " + schema + ".charges order by id")).isEqualTo(original);
        assertThat(jdbc.queryForObject("select count(*) from " + schema + ".charge_items", Long.class)).isEqualTo(count("charge_items"));
        assertThatThrownBy(() -> jdbc.execute("update " + schema + ".charges set status='CANCELED'"))
            .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("update " + schema + ".charges set status='CANCELED',canceled_at=now(),canceled_by=?", userId))
            .isInstanceOf(DataIntegrityViolationException.class);
        jdbc.update("update " + schema + ".charges set status='CANCELED',canceled_at=now(),canceled_by=?,cancellation_reason='UNIT_DELETED'", userId);
        assertThat(jdbc.queryForObject("select count(*) from " + schema + ".charges where status='CANCELED' and issued_at is not null", Long.class)).isEqualTo(4);
    }

    @Test
    void managerCannotBypassAdminResidentDeletionThroughUnitsOrBuildings() {
        var unitId = unitId("201");
        var resident = addResident(unitId, "보호할 주민", true);
        jdbc.update("update property_members set role='MANAGER' where property_id=? and user_id=?", propertyId, userId);
        assertThatThrownBy(() -> unitManagement.deleteUnits(userId, propertyId, List.of(unitId))).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> unitManagement.deleteBuilding(userId, propertyId, buildingId("201"))).isInstanceOf(AuthException.class);
        assertThat(jdbc.queryForObject("select deleted_at from residents where id=?", OffsetDateTime.class, resident)).isNull();
        assertThat(jdbc.queryForObject("select deleted_at from units where id=?", OffsetDateTime.class, unitId)).isNull();
        assertThat(jdbc.queryForObject("select count(*) from charges where status='CANCELED'", Long.class)).isZero();
    }

    private UUID unitId(String number) {
        return jdbc.queryForObject("select id from units where property_id=? and unit_number=?", UUID.class, propertyId, number);
    }

    private UUID buildingId(String number) {
        return jdbc.queryForObject("select building_id from units where property_id=? and unit_number=?", UUID.class, propertyId, number);
    }

    private com.moahome.server.property.dto.UnitRequest unitRequest(UUID buildingId, String number, String status) {
        return new com.moahome.server.property.dto.UnitRequest(buildingId, number, null, 7, status);
    }

    private void addMember(UUID property, UUID user, String role) {
        jdbc.update("insert into property_members(id,property_id,user_id,role,status,joined_at,created_at,updated_at) values (?,?,?,?,'ACTIVE',now(),now(),now())",
            UUID.randomUUID(), property, user, role);
    }

    private UUID addRequest(UUID unit, UUID user, UUID resident, String status) {
        var id = UUID.randomUUID();
        jdbc.update("insert into membership_requests(id,property_id,unit_id,user_id,matched_resident_id,match_status,status,request_phone_encrypted,request_phone_hmac,request_phone_last4,requested_at,created_at,updated_at) "
            + "values (?,?,?,?,?,?,?,'test',?,'1234',now(),now(),now())", id, propertyId, unit, user, resident, resident == null ? "NOT_MATCHED" : "MATCHED", status, "a".repeat(64));
        return id;
    }

    private UUID addResident(UUID unitId, String name, boolean representative) {
        UUID residentId = UUID.randomUUID();
        jdbc.update("insert into residents(id,property_id,name,status,created_at,updated_at) values (?,?,?,'ACTIVE',now(),now())", residentId, propertyId, name);
        jdbc.update("insert into unit_residents(id,property_id,resident_id,unit_id,relation_type,status,is_household_rep,created_at,updated_at) "
            + "values (?,?,?,?,'OTHER','ACTIVE',?,now(),now())", UUID.randomUUID(), propertyId, residentId, unitId, representative);
        return residentId;
    }

    @Test
    void repeatedSettingsKeepReasonsAndLatestWinsWithoutChangingIssuedSnapshots() {
        var first = billing.settings(userId, propertyId);
        var planned = billing.saveSettings(userId, propertyId, request(first.revisionId(), "2026-11", "첫 조정", -1000));
        assertThat(planned.current().items()).extracting(item -> item.amount()).contains("15000");
        assertThat(planned.scheduled().items().getFirst().amount()).isEqualTo("-1000");
        var zero = billing.saveSettings(userId, propertyId, request(planned.revisionId(), "2026-11", "두 번째 조정", 0));
        assertThat(zero.scheduled().reason()).isEqualTo("두 번째 조정");
        assertThat(jdbc.queryForList("select change_reason from fee_templates where revision>0 order by revision", String.class))
            .containsExactly("첫 조정", "두 번째 조정");
        assertThatThrownBy(() -> billing.saveSettings(userId, propertyId, request(first.revisionId(), "2026-11", "이전 버전", 9)))
            .isInstanceOf(BillingException.class);
        clock.set(Instant.parse("2026-10-31T15:00:00Z"));
        assertThatThrownBy(() -> billing.saveSettings(userId, propertyId, request(zero.revisionId(), "2026-11", "월 변경", 9)))
            .isInstanceOf(BillingException.class);
        generation.generate(propertyId, YearMonth.of(2026, 11));
        var issued = billing.monthly(userId, propertyId, YearMonth.of(2026, 11));
        assertThat(issued.baseAmount()).isEqualTo("0");
        var next = billing.saveSettings(userId, propertyId, request(zero.revisionId(), "2026-12", "음수 적용", -999));
        jdbc.update("update units set unit_number='999',display_name='새 별칭' where property_id=? and unit_number='201'", propertyId);
        assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 11))).isEqualTo(issued);
        var preview = billing.monthly(userId, propertyId, YearMonth.of(2026, 12));
        assertThat(preview.status()).isEqualTo("SCHEDULED");
        assertThat(preview.baseAmount()).isEqualTo("-999");
        clock.set(Instant.parse("2026-11-30T15:00:00Z"));
        generation.generate(propertyId, YearMonth.of(2026, 12));
        assertThat(billing.history(userId, propertyId).periods().getFirst().totalAmount()).isEqualTo("-1998");
        assertThat(next.scheduled().reason()).isEqualTo("음수 적용");
    }

    @Test
    void concurrentSchedulersCreateExactlyOneCompletePeriod() throws Exception {
        clock.set(Instant.parse("2026-10-31T15:00:00Z"));
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Boolean> task = () -> { start.await(); return generation.generate(propertyId, YearMonth.of(2026, 11)); };
            var a = executor.submit(task);
            var b = executor.submit(task);
            start.countDown();
            assertThat(List.of(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
        }
        assertThat(count("billing_periods")).isEqualTo(2);
        assertThat(count("charges")).isEqualTo(6);
        assertThat(count("charge_items")).isEqualTo(24);
    }

    @Test
    void failedSnapshotSaveRollsBackEverythingAndHourlyCatchupRetriesSafely() {
        // 이전 구현에서 등록월 청구가 빠진 기존 대상을 재현합니다.
        jdbc.update("delete from charge_items");
        jdbc.update("delete from charges");
        jdbc.update("delete from billing_periods");
        clock.set(Instant.parse("2026-11-30T15:00:00Z"));
        jdbc.execute("create function fail_billing() returns trigger language plpgsql as $$ begin raise exception 'test'; end; $$");
        jdbc.execute("create trigger fail_billing before insert on charge_items for each row execute function fail_billing()");
        assertThatThrownBy(() -> generation.generate(propertyId, YearMonth.of(2026, 11))).isInstanceOf(RuntimeException.class);
        for (String table : List.of("billing_periods", "charges", "charge_items")) assertThat(count(table)).isZero();
        var scheduler = new BillingScheduler(properties, generation, clock);
        scheduler.runDueBilling();
        assertThat(count("billing_periods")).isZero();
        jdbc.execute("drop function fail_billing() cascade");
        scheduler.runDueBilling();
        scheduler.runDueBilling();
        assertThat(count("billing_periods")).isEqualTo(3);
        assertThat(count("charges")).isEqualTo(6);
        assertThat(billing.history(userId, propertyId).periods()).hasSize(3);
        assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 10)).status()).isEqualTo("ISSUED");
    }

    @Test
    void authorizationDetailScopeAndDatabaseForeignKeysRejectOtherProperties() {
        UUID stranger = users.saveAndFlush(User.create("다른 관리자", null)).getId();
        assertThatThrownBy(() -> billing.settings(stranger, propertyId)).isInstanceOf(AuthException.class);
        clock.set(Instant.parse("2026-10-31T15:00:00Z"));
        generation.generate(propertyId, YearMonth.of(2026, 11));
        assertThatThrownBy(() -> billing.detail(userId, propertyId, YearMonth.of(2026, 11), UUID.randomUUID()))
            .isInstanceOf(BillingException.class);
        var other = registration.register(userId, RegistrationFixtures.request(UUID.randomUUID(), false)).response().property().id();
        UUID foreignUnit = jdbc.queryForObject("select id from units where property_id=? limit 1", UUID.class, other);
        assertThatThrownBy(() -> jdbc.update("update charges set unit_id=? where property_id=?", foreignUnit, propertyId))
            .isInstanceOf(DataIntegrityViolationException.class);
        var revision = billing.settings(userId, propertyId).revisionId();
        var tooBig = new BillingSettingsRequest(revision, "2026-12", "범위 검사", List.of(
            new BillingSettingsRequest.Item(null, "최대", 999999999999999L), new BillingSettingsRequest.Item(null, "초과", 1L)));
        assertThatThrownBy(() -> billing.saveSettings(userId, propertyId, tooBig)).isInstanceOf(IllegalArgumentException.class);
        assertThat(billing.settings(userId, propertyId).revisionId()).isEqualTo(revision);
    }
    private BillingSettingsRequest request(UUID revision, String month, String reason, long amount) {
        return new BillingSettingsRequest(revision, month, reason, List.of(new BillingSettingsRequest.Item(null, "조정 항목", amount)));
    }
    private long count(String table) { return jdbc.queryForObject("select count(*) from " + table, Long.class); }
    @TestConfiguration
    static class TestBeans {
        @Bean MutableClock clock() { return new MutableClock(Instant.now()); }
        @Bean ObjectMapper mapper() { return JsonMapper.builder().build(); }
        @Bean Validator validator() { return Validation.buildDefaultValidatorFactory().getValidator(); }
        @Bean AccountNumberSecurity accountSecurity() { return new AccountNumberSecurity(RegistrationTestKeys.accountProperties()); }
        @Bean RegistrationFingerprint fingerprints(ObjectMapper mapper) {
            return new RegistrationFingerprint(RegistrationTestKeys.fingerprintProperties(), mapper);
        }
    }
    /** 적용 전 스키마의 컬럼만 복사해 후속 Migration으로 추가된 감사 컬럼을 미리 주입하지 않습니다. */
    private void copyPreviousTable(String schema,String table) {
        String columns=jdbc.queryForObject("select string_agg(quote_ident(column_name),',' order by ordinal_position) from information_schema.columns where table_schema=? and table_name=?",String.class,schema,table);
        jdbc.execute("insert into "+schema+"."+table+"("+columns+") select "+columns+" from public."+table);
    }

}
