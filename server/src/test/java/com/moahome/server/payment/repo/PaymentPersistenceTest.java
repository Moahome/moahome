package com.moahome.server.payment.repo;

import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.support.MutableClock;
import com.moahome.server.banking.service.BankTransactionReader;
import com.moahome.server.billing.service.*;
import com.moahome.server.common.security.*;
import com.moahome.server.payment.dto.*;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.payment.service.PaymentService;
import com.moahome.server.property.dto.PropertyRegistrationRequest.UnitInput;
import com.moahome.server.property.service.*;
import com.moahome.server.property.repo.PropertyRegistrationLock;
import com.moahome.server.property.support.*;
import com.moahome.server.resident.service.*;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

@DataJpaTest(showSql=false)
@AutoConfigureTestDatabase(replace=AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(FlywayAutoConfiguration.class)
@Import({PaymentService.class,BankTransactionReader.class,BillingTemplates.class,BillingGenerationService.class,
    PropertyRegistrationService.class,PropertyRegistrationLock.class,ManagementAccessService.class,UserService.class,
    ResidentListService.class,PaymentPersistenceTest.TestBeans.class})
@ActiveProfiles("database-test")
@Transactional(propagation=Propagation.NOT_SUPPORTED)
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class PaymentPersistenceTest {
    static final PostgresTestServer POSTGRES=new PostgresTestServer();
    @Autowired PaymentService service;
    @Autowired BillingGenerationService billing;
    @Autowired PropertyRegistrationService registration;
    @Autowired UserRepository users;
    @Autowired MutableClock clock;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactionManager;
    UUID user,property,unit,otherUnit,charge;
    @DynamicPropertySource static void infrastructure(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",POSTGRES::jdbcUrl);r.add("spring.datasource.username",POSTGRES::username);r.add("spring.datasource.password",()->"");
    }
    @BeforeEach void prepare() {
        clock.set(Instant.parse("2026-10-15T00:00:00Z"));
        user=users.saveAndFlush(User.create("관리자",null)).getId();
        var request=RegistrationFixtures.withUnits(RegistrationFixtures.request(UUID.randomUUID(),false),List.of(
            new UnitInput(null,"101",null,1,"ACTIVE"),new UnitInput(null,"202",null,2,"ACTIVE")));
        property=registration.register(user,request).response().property().id();
        unit=jdbc.queryForObject("select id from units where property_id=? and unit_number='101'",UUID.class,property);
        otherUnit=jdbc.queryForObject("select id from units where property_id=? and unit_number='202'",UUID.class,property);
        charge=jdbc.queryForObject("select id from charges where property_id=? and unit_id=?",UUID.class,property,unit);
        resident(unit,"김대표",true);resident(otherUnit,"이대표",true);resident(unit,"김가족",false);
    }
    @AfterEach void cleanup() {
        jdbc.execute("drop function if exists fail_payment_event() cascade");
        jdbc.execute("truncate payment_events,payment_allocations,payments,bank_transactions,charge_items,charges,billing_periods,"
            +"property_registration_results,property_members,fee_template_items,fee_templates,bank_accounts,unit_residents,residents,"
            +"units,buildings,properties,social_accounts,users cascade");
    }
    @AfterAll static void close() { POSTGRES.close(); }
    void resident(UUID unit,String name,boolean rep) {
        UUID resident=UUID.randomUUID();
        jdbc.update("insert into residents(id,property_id,name,status,created_at,updated_at) values (?,?,?,'ACTIVE',now(),now())",resident,property,name);
        jdbc.update("insert into unit_residents(id,property_id,resident_id,unit_id,relation_type,status,is_household_rep,created_at,updated_at) "
            +"values (?,?,?,?,'OTHER','ACTIVE',?,now(),now())",UUID.randomUUID(),property,resident,unit,rep);
    }
    UUID manual(String amount) {
        UUID id=UUID.randomUUID();service.manual(user,property,new PaymentRequests.Manual(id,unit,LocalDate.of(2026,10,15),amount));return id;
    }
    PaymentRequests.Confirm confirm(String amount) { return new PaymentRequests.Confirm(unit,List.of(new PaymentRequests.Allocation(charge,amount)),null); }
    MockMultipartFile csv(String body) { return new MockMultipartFile("file","은행.csv","text/csv",body.getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
    MockMultipartFile bank(String payer,String amount) { return csv("입금일,입금자명,입금액\n2026-10-15,"+payer+","+amount); }
    long count(String table) { return jdbc.queryForObject("select count(*) from "+table,Long.class); }

    @Test void realRepresentativesAndIssuedChargesAreUsedAndManualRetriesDoNotDuplicate() {
        var ledger=service.workspace(user,property);
        assertThat(ledger.units()).extracting(PaymentResponse.Unit::representativeName).containsExactly("김대표","이대표");
        assertThat(ledger.charges()).allMatch(c->c.amount().equals("50000")&&c.dueDate().equals(LocalDate.of(2026,10,31)));
        UUID id=manual("80000");
        var input=new PaymentRequests.Manual(id,unit,LocalDate.of(2026,10,15),"80000");
        service.manual(user,property,input);
        var saved=service.confirm(user,property,id,confirm("50000"));
        service.confirm(user,property,id,confirm("50000"));
        var payment=saved.payments().stream().filter(p->p.id().equals(id)).findFirst().orElseThrow();
        assertThat(payment.payer()).isEqualTo("김대표");assertThat(payment.amount()).isEqualTo("80000");
        assertThat(payment.allocations().getFirst().amount()).isEqualTo("50000");
        assertThat(count("payments")).isEqualTo(1);assertThat(count("payment_allocations")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select payer_name_encrypted from payments where id=?",String.class,id)).doesNotContain("김대표");
        assertThat(jdbc.queryForObject("select count(*) from payment_events where action='CONFIRMED'",Long.class)).isEqualTo(1);
    }
    @Test void bankImportUsesRepresentativesExcludesFamilyAndDeduplicatesDateNameAmountAcrossFiles() {
        assertThat(service.preview(user,property,bank("김대표","50000")).rows().getFirst().unitId()).isEqualTo(unit.toString());
        assertThat(service.preview(user,property,bank("김가족","50000")).rows().getFirst().unitId()).isEmpty();
        assertThat(count("payments")).isZero();assertThat(count("bank_transactions")).isZero();
        service.importFile(user,property,bank("김대표","50000"));
        var different=csv("입금일,입금자명,입금액,적요\n2026-10-15,김대표,50000,다른 파일의 적요");
        assertThat(service.preview(user,property,different).duplicateCount()).isEqualTo(1);
        service.importFile(user,property,different);
        assertThat(count("payments")).isEqualTo(1);assertThat(count("bank_transactions")).isEqualTo(1);
        resident(otherUnit,"김대표",false);
    }
    @Test void duplicateManualLinksWithoutIncreasingReceiptsAndCancellationRestoresBankReview() {
        UUID manual=manual("50000");service.confirm(user,property,manual,confirm("50000"));
        var ledger=service.importFile(user,property,bank("김대표","50000"));
        var bank=ledger.payments().stream().filter(p->p.source().equals("BANK_IMPORT")).findFirst().orElseThrow();
        assertThatThrownBy(()->service.confirm(user,property,bank.id(),confirm("50000"))).isInstanceOf(PaymentException.class);
        var linked=service.link(user,property,bank.id(),manual);
        assertThat(linked.payments().stream().filter(p->p.status().equals("CONFIRMED"))).hasSize(1);
        assertThat(count("payment_allocations")).isEqualTo(1);
        var canceled=service.cancel(user,property,manual,"세대 확인 정정");service.cancel(user,property,manual,"다른 사유");
        assertThat(canceled.payments().stream().filter(p->p.id().equals(bank.id())).findFirst().orElseThrow().status()).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject("select count(*) from payment_allocations where status='ACTIVE'",Long.class)).isZero();
        assertThat(service.workspace(user,property).payments().stream().filter(p->p.id().equals(manual)).findFirst().orElseThrow().cancelReason()).isEqualTo("세대 확인 정정");
    }
    @Test void holdResumeAndCancelBankKeepOriginalAndCreateOneReviewDraft() {
        var p=service.importFile(user,property,bank("김대표","50000")).payments().getFirst();
        service.hold(user,property,p.id(),"입금자 확인");service.resume(user,property,p.id());service.confirm(user,property,p.id(),confirm("50000"));
        var canceled=service.cancel(user,property,p.id(),"잘못된 확정");service.cancel(user,property,p.id(),"재요청");
        assertThat(canceled.payments().stream().filter(row->row.status().equals("PENDING"))).hasSize(1);
        assertThat(count("bank_transactions")).isEqualTo(1);assertThat(count("payments")).isEqualTo(2);
    }
    @Test void concurrentConfirmationsCannotExceedSameCharge() throws Exception {
        UUID first=manual("50000"),second=manual("50000");var start=new CountDownLatch(1);
        try (var pool=Executors.newFixedThreadPool(2)) {
            List<Future<Boolean>> results=new ArrayList<>();
            for (UUID id:List.of(first,second)) results.add(pool.submit(()->{start.await();try { service.confirm(user,property,id,confirm("50000"));return true; }
                catch(PaymentException exception) {return false;} }));
            start.countDown();int success=0;for(var result:results) if(result.get(10,TimeUnit.SECONDS)) success++;
            assertThat(success).isEqualTo(1);
        }
        assertThat(jdbc.queryForObject("select sum(allocated_amount)::text from payment_allocations where status='ACTIVE'",String.class)).isEqualTo("50000");
    }
    @Test void databaseGuardRejectsOverAllocationAndChangingPaidCharge() {
        UUID id=manual("50000");
        assertThatThrownBy(()->new TransactionTemplate(transactionManager).execute(status->{
            jdbc.update("update payments set status='CONFIRMED',confirmed_by=?,confirmed_at=now() where id=?",user,id);
            jdbc.update("insert into payment_allocations(id,property_id,payment_id,charge_id,allocated_amount,status,allocated_by,allocated_at) "
                +"values (?,?,?,?,60000,'ACTIVE',?,now())",UUID.randomUUID(),property,id,charge,user);return null;
        })).isInstanceOf(RuntimeException.class);
        assertThat(count("payment_allocations")).isZero();
        service.confirm(user,property,id,confirm("50000"));
        assertThatThrownBy(()->billing.cancelCurrentMonthUnits(user,property,List.of(unit),OffsetDateTime.now(clock)))
            .isInstanceOf(com.moahome.server.billing.exception.BillingException.class);
        assertThatThrownBy(()->jdbc.update("update charges set status='EXCLUDED_VACANT' where id=?",charge)).isInstanceOf(org.springframework.dao.DataAccessException.class);
    }
    @Test void lateFailureRollsBackPaymentAllocationAndEventTogether() {
        UUID id=manual("50000");
        jdbc.execute("create function fail_payment_event() returns trigger language plpgsql as $$ begin raise exception 'test failure';end $$");
        jdbc.execute("create trigger payment_event_failure before insert on payment_events for each row execute function fail_payment_event()");
        assertThatThrownBy(()->service.confirm(user,property,id,confirm("50000"))).isInstanceOf(RuntimeException.class);
        assertThat(count("payment_allocations")).isZero();
        assertThat(jdbc.queryForObject("select status from payments where id=?",String.class,id)).isEqualTo("PENDING");
    }
    @Test void unauthorizedScopeMissingRepresentativeAndNonpositiveChargeAreRejected() {
        UUID id=manual("50000");
        assertThatThrownBy(()->service.confirm(user,UUID.randomUUID(),id,confirm("50000"))).isInstanceOf(AuthException.class);
        jdbc.update("update charges set total_amount=-500 where id=?",charge);
        assertThat(service.workspace(user,property).charges().stream().filter(c->c.id().equals(charge)).findFirst().orElseThrow().amount()).isEqualTo("-500");
        assertThatThrownBy(()->service.confirm(user,property,id,confirm("1"))).isInstanceOf(PaymentException.class);
        jdbc.update("update unit_residents set is_household_rep=false where unit_id=?",unit);
        assertThatThrownBy(()->manual("50000")).isInstanceOf(PaymentException.class);
        jdbc.update("update property_members set role='MANAGER' where property_id=? and user_id=?",property,user);
        assertThatThrownBy(()->service.workspace(user,property)).isInstanceOf(AuthException.class);
    }
    @Test void upgradeKeepsExistingResidentsAccountsAndBillsWithoutCreatingSampleReceipts() {
        String schema="payment_upgrade_"+UUID.randomUUID().toString().replace("-","");
        var previous=org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(),POSTGRES.username(),"")
            .schemas(schema).defaultSchema(schema).target("20261012063902").load();previous.migrate();
        for(String table:List.of("users","properties","buildings","units","bank_accounts","residents","unit_residents",
            "fee_templates","fee_template_items","billing_periods","charges","charge_items"))
            jdbc.execute("insert into "+schema+"."+table+" select * from public."+table);
        var before=jdbc.queryForList("select * from "+schema+".charges order by id");
        var upgraded=org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(),POSTGRES.username(),"")
            .schemas(schema).defaultSchema(schema).load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(2);upgraded.validate();
        assertThat(jdbc.queryForList("select * from "+schema+".charges order by id")).isEqualTo(before);
        assertThat(jdbc.queryForObject("select count(*) from "+schema+".residents",Long.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("select count(*) from "+schema+".payments",Long.class)).isZero();
        jdbc.execute("drop schema "+schema+" cascade");
    }
    /** 실제 적용된 초기 체크섬에서 업그레이드해도 원본·확정 수납·배분을 그대로 유지해야 합니다. */
    @Test void appliedPaymentMigrationUpgradesWithoutChecksumRepairOrReceiptChanges() {
        UUID id=manual("80000");service.confirm(user,property,id,confirm("50000"));
        service.importFile(user,property,bank("이대표","25000"));
        String schema="applied_payment_"+UUID.randomUUID().toString().replace("-","");
        var previous=org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(),POSTGRES.username(),"")
            .schemas(schema).defaultSchema(schema).target("20261015231910").load();
        previous.migrate();
        assertThat(previous.info().current().getChecksum()).isEqualTo(940038749);
        // 초기 함수는 호출 당시 경로를 사용하므로 기존 DB 상태를 재현하는 복사도 같은 스키마에서 수행합니다.
        new TransactionTemplate(transactionManager).execute(status->{
            jdbc.execute("set local search_path to "+schema+",public");
            for(String table:List.of("users","properties","buildings","units","bank_accounts","residents","unit_residents",
                "fee_templates","fee_template_items","billing_periods","charges","charge_items"))
                jdbc.execute("insert into "+schema+"."+table+" select * from public."+table);
            String columns="id,property_id,bank_account_id,transaction_date,amount,payer_name_encrypted,payer_name_hmac,"
                +"memo_encrypted,bank_reference,deduplication_key,imported_by,imported_at";
            jdbc.execute("insert into "+schema+".bank_transactions("+columns+") select "+columns+" from public.bank_transactions");
            for(String table:List.of("payments","payment_allocations","payment_events"))
                jdbc.execute("insert into "+schema+"."+table+" select * from public."+table);
            return null;
        });
        var receipts=jdbc.queryForList("select * from "+schema+".payments order by id");
        var applied=jdbc.queryForList("select * from "+schema+".payment_allocations order by id");
        var originals=jdbc.queryForList("select id,amount,payer_name_encrypted,deduplication_key from "+schema+".bank_transactions order by id");
        var upgraded=org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(),POSTGRES.username(),"")
            .schemas(schema).defaultSchema(schema).load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(1);upgraded.validate();
        assertThat(jdbc.queryForList("select * from "+schema+".payments order by id")).isEqualTo(receipts);
        assertThat(jdbc.queryForList("select * from "+schema+".payment_allocations order by id")).isEqualTo(applied);
        assertThat(jdbc.queryForList("select id,amount,payer_name_encrypted,deduplication_key from "+schema+".bank_transactions order by id")).isEqualTo(originals);
        assertThat(jdbc.queryForObject("select count(*) from "+schema+".bank_transactions where transaction_time is null and balance is null",Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForList("select p.proconfig::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
            +"where n.nspname=? and p.proname in ('validate_payment_allocation','protect_allocated_charge')",String.class,schema))
            .hasSize(2).allMatch(config->config.contains(schema));
        assertThatThrownBy(()->jdbc.update("update "+schema+".charges set status='EXCLUDED_VACANT' where id=?",charge))
            .isInstanceOf(org.springframework.dao.DataAccessException.class);
        jdbc.execute("drop schema "+schema+" cascade");
    }
    @TestConfiguration static class TestBeans {
        @Bean MutableClock clock() { return new MutableClock(Instant.now()); }
        @Bean ObjectMapper mapper() { return JsonMapper.builder().build(); }
        @Bean Validator validator() { return Validation.buildDefaultValidatorFactory().getValidator(); }
        @Bean AccountNumberSecurity accountSecurity() { return new AccountNumberSecurity(RegistrationTestKeys.accountProperties()); }
        @Bean PaymentTextSecurity paymentSecurity() { return new PaymentTextSecurity(RegistrationTestKeys.accountProperties()); }
        @Bean RegistrationFingerprint fingerprints(ObjectMapper mapper) { return new RegistrationFingerprint(RegistrationTestKeys.fingerprintProperties(),mapper); }
    }
}
