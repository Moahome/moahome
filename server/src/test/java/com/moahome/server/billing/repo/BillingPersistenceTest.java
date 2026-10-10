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
@Import({BillingService.class, BillingTemplates.class, BillingGenerationService.class,
    PropertyRegistrationService.class, PropertyRegistrationLock.class, ManagementAccessService.class,
    UserService.class, com.moahome.server.resident.service.ResidentListService.class, BillingPersistenceTest.TestBeans.class})
@ActiveProfiles("database-test")
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class BillingPersistenceTest {
    private static final PostgresTestServer POSTGRES = new PostgresTestServer();
    @Autowired BillingService billing;
    @Autowired BillingGenerationService generation;
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
            new UnitInput("a", "202", null, 2, "VACANT"),
            new UnitInput("b", "301", null, 3, "ACTIVE"),
            new UnitInput("b", "302", null, 3, "ACTIVE")));
        propertyId = registration.register(userId, request).response().property().id();
        jdbc.update("update units set status='INACTIVE' where property_id=? and unit_number='301'", propertyId);
        jdbc.update("update units set deleted_at=now() where property_id=? and unit_number='302'", propertyId);
    }
    @AfterEach
    void cleanup() {
        jdbc.execute("drop function if exists fail_billing() cascade");
        jdbc.execute("truncate charge_items, charges, billing_periods, property_registration_results, property_members, "
            + "fee_template_items, fee_templates, bank_accounts, units, buildings, properties, social_accounts, users cascade");
    }
    @AfterAll static void stopPostgres() { POSTGRES.close(); }

    @Test
    void registrationIssuesCurrentMonthImmediatelyAndNextMonthIncludesActiveAndVacantOnly() {
        var settings = billing.settings(userId, propertyId);
        assertThat(settings.firstBillingMonth()).isEqualTo("2026-10");
        var initial = billing.monthly(userId, propertyId, YearMonth.of(2026, 10));
        assertThat(initial.status()).isEqualTo("ISSUED");
        assertThat(initial.charges()).hasSize(4);
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
        assertThat(billing.monthly(userId, propertyId, YearMonth.of(2026, 10))).isEqualTo(initial);
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
}
