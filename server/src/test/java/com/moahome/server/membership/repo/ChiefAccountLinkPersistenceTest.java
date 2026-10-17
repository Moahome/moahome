package com.moahome.server.membership.repo;

import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.membership.domain.*;
import com.moahome.server.membership.service.MemberManagementService;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.repo.*;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.resident.domain.*;
import com.moahome.server.resident.repo.*;
import com.moahome.server.user.domain.User;
import com.moahome.server.user.repo.UserRepository;
import com.moahome.server.user.service.UserService;
import com.moahome.server.user.support.PostgresTestServer;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;
import org.springframework.transaction.annotation.*;
import static org.assertj.core.api.Assertions.*;

@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(FlywayAutoConfiguration.class)
@Import({MemberManagementService.class, ManagementAccessService.class, UserService.class, ChiefAccountLinkPersistenceTest.Beans.class})
@ActiveProfiles("database-test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class ChiefAccountLinkPersistenceTest {
    private static final PostgresTestServer POSTGRES = new PostgresTestServer();
    private static final OffsetDateTime AT = OffsetDateTime.parse("2026-10-17T04:41:08Z");
    @Autowired MemberManagementService service;
    @Autowired PropertyRepository properties;
    @Autowired PropertyMemberRepository members;
    @Autowired UnitRepository units;
    @Autowired ResidentRepository residents;
    @Autowired UnitResidentRepository affiliations;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;
    private Property property;
    private Unit unit;
    private User actor;

    @DynamicPropertySource
    static void infrastructure(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::jdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::username);
        registry.add("spring.datasource.password", () -> "");
    }
    @AfterAll static void stopPostgres() { POSTGRES.close(); }

    @BeforeEach void prepare() {
        actor = users.saveAndFlush(User.create("관리소장 닉네임", null));
        property = properties.saveAndFlush(Property.create("기존 빌라", "주소", null, null, false, AT));
        unit = units.saveAndFlush(Unit.create(property, null, "101", null, null, UnitStatus.ACTIVE, AT));
        members.saveAndFlush(PropertyMember.creator(property, actor, AT));
    }
    @AfterEach void cleanup() {
        jdbc.execute("drop function if exists fail_account_link() cascade");
        for (String table : List.of("resident_account_links", "member_role_events", "member_invitations", "unit_residents",
            "residents", "property_members", "units", "properties", "social_accounts", "users")) jdbc.update("delete from " + table);
    }
    private Resident person(String name, boolean representative) {
        var person = residents.saveAndFlush(Resident.register(UUID.randomUUID(), property.getId(), name, null, null, null, AT));
        affiliations.saveAndFlush(UnitResident.register(person, unit, "TENANT", representative, AT));
        return person;
    }
    private void connect(Resident resident) { service.linkOwnResident(actor.getId(), property.getId(), resident.getId(), unit.getId()); }
    private int count(String table) { return jdbc.queryForObject("select count(*) from " + table, Integer.class); }
    private void assertConflict(Runnable action, String code) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(PaymentException.class, failure -> assertThat(failure.code()).isEqualTo(code));
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void linksCurrentChiefAndKeepsRoleRepresentativeAndExistingInformation(boolean representative) {
        var resident = person("본인 실명", representative);
        connect(resident);
        connect(resident); // 응답 유실 후 같은 요청을 재시도해도 연결 이력과 참여가 중복되지 않습니다.
        assertThat(residents.findById(resident.getId()).orElseThrow().getUserId()).isEqualTo(actor.getId());
        assertThat(residents.findDirectory(property.getId())).singleElement().satisfies(row -> {
            assertThat(row.getApproved()).isTrue();
            assertThat(row.getServiceRole()).isEqualTo("ADMIN");
            assertThat(row.getRepresentative()).isEqualTo(representative);
            assertThat(row.getName()).isEqualTo("본인 실명");
            assertThat(row.getPhoneLast4()).isNull();
            assertThat(row.getUnitId()).isEqualTo(unit.getId());
            assertThat(row.getRelationType()).isEqualTo("TENANT");
        });
        assertThat(count("resident_account_links")).isEqualTo(1);
        assertThat(count("property_members")).isEqualTo(1);
        assertThat(count("membership_requests")).isZero();
        assertThat(count("member_role_events")).isZero();
    }

    @Test void rejectsResidentAlreadyLinkedToAnotherAccount() {
        var resident = person("다른 계정 주민", false);
        var other = users.saveAndFlush(User.create("다른 계정", null));
        jdbc.update("update residents set user_id=? where id=?", other.getId(), resident.getId());
        assertConflict(() -> connect(resident), "MEMBER_ROLE_CONFLICT");
        assertThat(residents.findById(resident.getId()).orElseThrow().getUserId()).isEqualTo(other.getId());
        assertThat(count("resident_account_links")).isZero();
    }
    @Test void rejectsConnectingChiefToASecondResident() {
        var first = person("본인", false);
        var second = person("다른 명부", false);
        connect(first);
        assertConflict(() -> connect(second), "MEMBER_ROLE_CONFLICT");
        assertThat(residents.findById(second.getId()).orElseThrow().getUserId()).isNull();
        assertThat(count("resident_account_links")).isEqualTo(1);
    }
    @Test void rejectsForeignDeletedAndUnhousedResidentsAndStaleUnitSelection() {
        var foreignProperty = properties.saveAndFlush(Property.create("다른 빌라", "주소", null, null, false, AT));
        var foreign = residents.saveAndFlush(Resident.register(UUID.randomUUID(), foreignProperty.getId(), "다른 대상", null, null, null, AT));
        assertConflict(() -> connect(foreign), "MEMBER_NOT_FOUND");
        var deleted = person("삭제 주민", false);
        jdbc.update("update residents set deleted_at=now() where id=?", deleted.getId());
        assertConflict(() -> connect(deleted), "MEMBER_NOT_FOUND");
        var unhoused = residents.saveAndFlush(Resident.register(UUID.randomUUID(), property.getId(), "세대 없는 주민", null, null, null, AT));
        assertConflict(() -> connect(unhoused), "MEMBER_RESIDENT_REQUIRED");
        var current = person("현재 주민", false);
        assertConflict(() -> service.linkOwnResident(actor.getId(), property.getId(), current.getId(), UUID.randomUUID()), "MEMBER_ROLE_CONFLICT");
        assertThat(count("resident_account_links")).isZero();
    }
    @ParameterizedTest @ValueSource(strings = {"MANAGER", "RESIDENT"})
    void rejectsAccountsWhoAreNotCurrentChief(String role) {
        var resident = person("본인", false);
        jdbc.update("update property_members set role=? where property_id=?", role, property.getId());
        assertThatThrownBy(() -> connect(resident)).isInstanceOf(AuthException.class);
        assertThat(residents.findById(resident.getId()).orElseThrow().getUserId()).isNull();
        assertThat(count("resident_account_links")).isZero();
    }
    @Test void doesNotRestoreApprovalForANewAffiliationUntilExplicitlyLinkedAgain() {
        var resident = person("본인", false);
        connect(resident);
        jdbc.update("update unit_residents set status='MOVED_OUT' where resident_id=?", resident.getId());
        var persisted = residents.findById(resident.getId()).orElseThrow();
        affiliations.saveAndFlush(UnitResident.register(persisted, unit, "TENANT", false, AT));
        assertThat(residents.findDirectory(property.getId()).getFirst().getApproved()).isFalse();
        connect(persisted);
        assertThat(residents.findDirectory(property.getId()).getFirst().getApproved()).isTrue();
        assertThat(count("resident_account_links")).isEqualTo(2);
    }
    @Test void rollsBackTheResidentAccountWhenAuditStorageFails() {
        var resident = person("본인", false);
        jdbc.execute("create function fail_account_link() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$");
        jdbc.execute("create trigger fail_account_link before insert on resident_account_links for each row execute function fail_account_link()");
        assertThatThrownBy(() -> connect(resident)).isInstanceOf(DataAccessException.class);
        assertThat(residents.findById(resident.getId()).orElseThrow().getUserId()).isNull();
        assertThat(count("resident_account_links")).isZero();
        assertThat(members.findByPropertyIdAndUserIdAndDeletedAtIsNull(property.getId(), actor.getId()).getFirst().getRole()).isEqualTo(PropertyMemberRole.ADMIN);
    }
    @Test void serializesConcurrentSelectionsWithoutBindingTwoResidents() throws Exception {
        var first = person("첫 후보", false);
        var second = person("두번째 후보", false);
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            var start = new CountDownLatch(1);
            var jobs = List.of(first, second).stream().map(person -> pool.submit(() -> {
                start.await();
                try { connect(person); return "OK"; }
                catch (PaymentException failure) { return failure.code(); }
            })).toList();
            start.countDown();
            assertThat(List.of(jobs.get(0).get(10, TimeUnit.SECONDS), jobs.get(1).get(10, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder("OK", "MEMBER_ROLE_CONFLICT");
        }
        assertThat(count("resident_account_links")).isEqualTo(1);
        assertThat(residents.findByPropertyIdAndUserIdAndDeletedAtIsNull(property.getId(), actor.getId())).hasSize(1);
    }
    @Test void upgradesExistingDataWithoutAutomaticallyLinkingAnyone() {
        String schema = "chief_link_" + UUID.randomUUID().toString().replace("-", "");
        var previous = Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
            .schemas(schema).defaultSchema(schema).target("20261017014220").load();
        previous.migrate();
        var existing = UUID.randomUUID();
        jdbc.update("insert into " + schema + ".properties(id,name,address,has_buildings,status,created_at,updated_at) values (?,'기존 대상','주소',false,'ACTIVE',now(),now())", existing);
        var upgraded = Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
            .schemas(schema).defaultSchema(schema).load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(1);
        upgraded.validate();
        assertThat(jdbc.queryForObject("select name from " + schema + ".properties where id=?", String.class, existing)).isEqualTo("기존 대상");
        assertThat(jdbc.queryForObject("select count(*) from " + schema + ".resident_account_links", Integer.class)).isZero();
        jdbc.execute("drop schema " + schema + " cascade");
    }
    @TestConfiguration static class Beans {
        @Bean Clock clock() { return Clock.fixed(AT.toInstant(), ZoneOffset.UTC); }
    }
}
