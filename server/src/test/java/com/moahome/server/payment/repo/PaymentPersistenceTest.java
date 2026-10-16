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
@Import({com.moahome.server.payment.service.CumulativePaymentService.class,PaymentService.class,BankTransactionReader.class,BillingTemplates.class,BillingGenerationService.class,
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

    /** 명부 밖 실제 입금을 확정해도 세대 청구·선입금에 영향을 주지 않고 원본과 암호화 분류를 보존합니다. */
    @Test void otherBankIncomeIsSeparateIdempotentAndNeverAllocatedToHouseholds() {
        var file=bank("외부입금자","93960");
        var original=service.importFile(user,property,file).payments().getFirst();
        var request=new PaymentRequests.OtherIncome("전기료","외부 사용분");
        var result=service.confirmOtherIncome(user,property,original.id(),request);
        var income=result.payments().getFirst();
        assertThat(income.receiptType()).isEqualTo("OTHER");
        assertThat(income.status()).isEqualTo("CONFIRMED");
        assertThat(income.unitId()).isEmpty();assertThat(income.allocations()).isEmpty();
        assertThat(income.incomeCategory()).isEqualTo("전기료");assertThat(income.incomeNote()).isEqualTo("외부 사용분");
        assertThat(income.bankTransactionId()).isEqualTo(original.bankTransactionId());
        assertThat(income.payer()).isEqualTo(original.payer());assertThat(income.amount()).isEqualTo("93960");
        service.confirmOtherIncome(user,property,original.id(),request);
        service.confirmMatches(user,property);
        clock.set(Instant.parse("2026-11-01T00:00:00Z"));billing.generate(property,YearMonth.of(2026,11));
        assertThat(count("payment_allocations")).isZero();assertThat(count("payments")).isEqualTo(1);
        assertThat(service.preview(user,property,file).duplicateCount()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select income_category_encrypted from payments where id=?",String.class,income.id())).doesNotContain("전기료");
        assertThat(jdbc.queryForObject("select income_note_encrypted from payments where id=?",String.class,income.id())).doesNotContain("외부 사용분");
        assertThat(jdbc.queryForObject("select count(*) from payment_events where action='OTHER_INCOME_CONFIRMED'",Long.class)).isEqualTo(1);
        assertThatThrownBy(()->service.confirmOtherIncome(user,property,original.id(),new PaymentRequests.OtherIncome("이자",null))).isInstanceOf(PaymentException.class);
        assertThatThrownBy(()->service.confirm(user,property,original.id(),new PaymentRequests.Confirm(unit,null,null))).isInstanceOf(PaymentException.class);
    }

    /** 분류 취소는 최초 이력을 보존하고 같은 원본을 다시 검토하게 하며 재요청으로 초안을 늘리지 않습니다. */
    @Test void cancelOtherIncomeRestoresReviewDraftAndAllowsHouseholdReclassification() {
        var file=bank("외부입금자","50000");
        var original=service.importFile(user,property,file).payments().getFirst();
        service.confirmOtherIncome(user,property,original.id(),new PaymentRequests.OtherIncome("기타",null));
        service.cancel(user,property,original.id(),"분류 정정");
        var canceled=service.cancel(user,property,original.id(),"다른 사유");
        assertThat(canceled.payments()).hasSize(2);
        var history=canceled.payments().stream().filter(p->p.id().equals(original.id())).findFirst().orElseThrow();
        assertThat(history.status()).isEqualTo("CANCELED");assertThat(history.receiptType()).isEqualTo("OTHER");
        assertThat(history.incomeCategory()).isEqualTo("기타");assertThat(history.cancelReason()).isEqualTo("분류 정정");
        var draft=canceled.payments().stream().filter(p->p.status().equals("PENDING")).findFirst().orElseThrow();
        assertThat(draft.receiptType()).isEqualTo("HOUSEHOLD");assertThat(draft.incomeCategory()).isNull();
        assertThat(draft.bankTransactionId()).isEqualTo(original.bankTransactionId());
        assertThat(service.preview(user,property,file).duplicateCount()).isEqualTo(1);
        assertThat(service.confirm(user,property,draft.id(),new PaymentRequests.Confirm(unit,null,null)).payments().stream()
            .filter(p->p.id().equals(draft.id())).findFirst().orElseThrow().allocations()).hasSize(1);
        assertThat(count("bank_transactions")).isEqualTo(1);
    }

    /** 기타 분류도 관리자 권한·상태·원본 중복 검사를 우회할 수 없으며 감사 저장 실패 시 원자적으로 롤백합니다. */
    @Test void otherIncomeRejectsInvalidStatesAndRollsBackAuditFailure() {
        var original=service.importFile(user,property,bank("외부입금자","50000")).payments().getFirst();
        var request=new PaymentRequests.OtherIncome("기타",null);
        UUID outsider=users.saveAndFlush(User.create("다른 관리자",null)).getId();
        assertThatThrownBy(()->service.confirmOtherIncome(outsider,property,original.id(),request)).isInstanceOf(AuthException.class);
        assertThatThrownBy(()->service.confirmOtherIncome(user,property,original.id(),new PaymentRequests.OtherIncome(" ",null))).isInstanceOf(PaymentException.class);
        assertThatThrownBy(()->service.confirmOtherIncome(user,property,manual("50000"),request)).isInstanceOf(PaymentException.class);
        service.hold(user,property,original.id(),"확인 중");
        assertThatThrownBy(()->service.confirmOtherIncome(user,property,original.id(),request)).isInstanceOf(PaymentException.class);
        service.resume(user,property,original.id());
        jdbc.execute("create function fail_payment_event() returns trigger language plpgsql as $$ begin if NEW.action='OTHER_INCOME_CONFIRMED' then raise exception 'test failure';end if;return NEW;end $$");
        jdbc.execute("create trigger payment_event_failure before insert on payment_events for each row execute function fail_payment_event()");
        assertThatThrownBy(()->service.confirmOtherIncome(user,property,original.id(),request)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        var unchanged=service.workspace(user,property).payments().stream().filter(p->p.id().equals(original.id())).findFirst().orElseThrow();
        assertThat(unchanged.status()).isEqualTo("PENDING");assertThat(unchanged.receiptType()).isEqualTo("HOUSEHOLD");
        assertThat(unchanged.incomeCategory()).isNull();assertThat(count("payment_allocations")).isZero();
    }

    /** DB도 기타 입금에 세대 연결·청구 충당을 허용하지 않아 SQL 우회로 수납 합계가 변하지 않습니다. */
    @Test void databaseRejectsHouseholdLinksAndAllocationsForOtherIncome() {
        var original=service.importFile(user,property,bank("외부입금자","50000")).payments().getFirst();
        service.confirmOtherIncome(user,property,original.id(),new PaymentRequests.OtherIncome("기타",null));
        assertThatThrownBy(()->jdbc.update("update payments set matched_unit_id=? where id=?",unit,original.id())).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(()->new TransactionTemplate(transactionManager).execute(status->{
            jdbc.update("insert into payment_allocations(id,property_id,payment_id,charge_id,allocated_amount,status,allocated_by,allocated_at) values (?,?,?,?,100,'ACTIVE',?,now())",
                UUID.randomUUID(),property,original.id(),charge,user);return null;
        })).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(count("payment_allocations")).isZero();
    }

    @Test void realRepresentativesAndIssuedChargesAreUsedAndManualRetriesDoNotDuplicate() {
        var ledger=service.workspace(user,property);
        assertThat(ledger.units()).extracting(PaymentResponse.Unit::representativeName).containsExactly("김대표","이대표");
        assertThat(ledger.units().stream().filter(u->u.id().equals(unit)).findFirst().orElseThrow().residentNames()).containsExactlyInAnyOrder("김대표","김가족");
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
    @Test void bankImportMatchesRosterNamesAndDeduplicatesDateNameAmountAcrossFiles() {
        assertThat(service.preview(user,property,bank("김대표","50000")).rows().getFirst().unitId()).isEqualTo(unit.toString());
        assertThat(service.preview(user,property,bank("김가족","50000")).rows().getFirst().unitId()).isEqualTo(unit.toString());
        assertThat(count("payments")).isZero();assertThat(count("bank_transactions")).isZero();
        service.importFile(user,property,bank("김대표","50000"));
        var different=csv("입금일,입금자명,입금액,적요\n2026-10-15,김대표,50000,다른 파일의 적요");
        assertThat(service.preview(user,property,different).duplicateCount()).isEqualTo(1);
        service.importFile(user,property,different);
        assertThat(count("payments")).isEqualTo(1);assertThat(count("bank_transactions")).isEqualTo(1);
        resident(otherUnit,"김대표",false);
        assertThat(service.preview(user,property,bank("김대표","60000")).rows().getFirst().unitId()).isEmpty();
    }
    @Test void bankXlsPreviewImportConfirmationAndReuploadReuseOneReceipt() throws Exception {
        try(var workbook=new org.apache.poi.hssf.usermodel.HSSFWorkbook();var bytes=new java.io.ByteArrayOutputStream()) {
            var sheet=workbook.createSheet("거래내역조회");
            sheet.createRow(0).createCell(0).setCellValue("거래내역조회");
            var header=sheet.createRow(5);
            var labels=List.of("거래일시","구분","적요","출금액","입금액","잔액","거래점");
            for(int i=0;i<labels.size();i++) header.createCell(i).setCellValue(labels.get(i));
            for(int i=0;i<2;i++) {
                var row=sheet.createRow(6+i);
                row.createCell(0).setCellValue("2026-10-15 09:12:34");
                row.createCell(2).setCellValue(i==0?"김대표":"청소비");
                row.createCell(3).setCellValue(i==0?0:20000);
                row.createCell(4).setCellValue(i==0?50000:0);
                row.createCell(5).setCellValue(i==0?150000:130000);
            }
            workbook.write(bytes);
            var file=new MockMultipartFile("file","거래내역조회.xls","application/vnd.ms-excel",bytes.toByteArray());
            var preview=service.preview(user,property,file);
            assertThat(preview.rows()).hasSize(1);
            assertThat(preview.rows().getFirst().unitId()).isEqualTo(unit.toString());
            assertThat(count("bank_transactions")).isZero();assertThat(count("payments")).isZero();
            var imported=service.importFile(user,property,file).payments().getFirst();
            assertThat(imported.status()).isEqualTo("CONFIRMED");
            assertThat(imported.memo()).isEqualTo("김대표");
            assertThat(count("payment_allocations")).isEqualTo(1);
            assertThat(jdbc.queryForObject("select transaction_time::text from bank_transactions",String.class)).isEqualTo("09:12:34");
            assertThat(jdbc.queryForObject("select balance::text from bank_transactions",String.class)).isEqualTo("150000");
            service.confirm(user,property,imported.id(),confirm("50000"));
            assertThat(service.preview(user,property,file).duplicateCount()).isEqualTo(1);
            service.importFile(user,property,file);
            assertThat(count("bank_transactions")).isEqualTo(1);assertThat(count("payments")).isEqualTo(1);
            assertThat(count("payment_allocations")).isEqualTo(1);
        }
    }
    /** 동·호수 표기는 공백 차이나 마지막 호 생략에도 같은 실제 세대를 후보로 표시하며 은행 원문은 변경하지 않습니다. */
    @Test void buildingAndUnitPayerSuggestsExistingUnitWithoutRenamingResident() {
        UUID building=UUID.randomUUID();
        jdbc.update("update properties set has_buildings=true where id=?",property);
        jdbc.update("insert into buildings(id,property_id,name,sort_order,status,created_at,updated_at) values (?,?,'102동',0,'ACTIVE',now(),now())",building,property);
        jdbc.update("update units set building_id=?,unit_number='401' where id=?",building,unit);
        for(String payer:List.of("102동401호","102동 401호","102동  401호","102동401","102동 401")) {
            var row=service.preview(user,property,bank(payer,"50000")).rows().getFirst();
            assertThat(row.unitId()).isEqualTo(unit.toString());assertThat(row.reason()).isEqualTo("동·호수 일치");
            assertThat(row.payer()).isEqualTo(payer);
        }
        assertThat(service.preview(user,property,bank("102동999호","50000")).rows().getFirst().unitId()).isEmpty();
        assertThat(service.preview(user,property,bank("김대표","50000")).rows().getFirst().unitId()).isEqualTo(unit.toString());
        var imported=service.importFile(user,property,bank("102동401호","50000")).payments().getFirst();
        assertThat(imported.unitId()).isEqualTo(unit.toString());
        assertThat(jdbc.queryForObject("select matched_unit_id from payments where id=?",UUID.class,imported.id())).isEqualTo(unit);
        assertThat(service.workspace(user,property).units().stream().filter(u->u.id().equals(unit)).findFirst().orElseThrow().representativeName()).isEqualTo("김대표");
    }
    /** '호'가 없는 실제 은행 표기도 조회·재매칭·새 가져오기에서 동일한 세대에 연결합니다. */
    @Test void missingHoMatchesExistingPendingAndAutoConfirmsNewDepositsWithoutPartialMatches() {
        var original=bank("103동501","50000");
        var pending=service.importFile(user,property,original).payments().getFirst();
        assertThat(pending.unitId()).isEmpty();assertThat(pending.status()).isEqualTo("PENDING");
        UUID building=UUID.randomUUID();
        jdbc.update("update properties set has_buildings=true where id=?",property);
        jdbc.update("insert into buildings(id,property_id,name,sort_order,status,created_at,updated_at) values (?,?,'103동',0,'ACTIVE',now(),now())",building,property);
        jdbc.update("update units set building_id=?,unit_number='501' where id=?",building,unit);
        var candidate=service.workspace(user,property).payments().getFirst();
        assertThat(candidate.unitId()).isEqualTo(unit.toString());assertThat(candidate.reason()).isEqualTo("동·호수 일치");
        for(String payer:List.of("103동50","103동501관리비","103동501호호","104동501"))
            assertThat(service.preview(user,property,bank(payer,"50000")).rows().getFirst().unitId()).isEmpty();
        var confirmed=service.confirmMatches(user,property).payments().getFirst();
        assertThat(confirmed.unitId()).isEqualTo(unit.toString());assertThat(confirmed.status()).isEqualTo("CONFIRMED");
        assertThat(confirmed.payer()).isEqualTo("103동501");
        var next=csv("입금일,입금자명,입금액\n2026-10-14,103동 501,50000");
        var imported=service.importFile(user,property,next);
        assertThat(imported.payments()).hasSize(2).allMatch(p->p.status().equals("CONFIRMED")&&p.unitId().equals(unit.toString()));
        assertThat(service.preview(user,property,original).duplicateCount()).isEqualTo(1);
        assertThat(service.preview(user,property,next).duplicateCount()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select sum(amount)::text from payments where status='CONFIRMED'",String.class)).isEqualTo("100000");
        assertThat(jdbc.queryForObject("select sum(allocated_amount)::text from payment_allocations where status='ACTIVE'",String.class)).isEqualTo("50000");
    }
    /** 같은 달 여러 실제 입금은 모두 수납하며 이미 완납한 세대의 추가 입금도 전액 선입금으로 유지합니다. */
    @Test void repeatedDepositsAccumulateAndPrepaymentAutomaticallyPaysNextMonth() {
        var file=csv("입금일,입금자명,입금액\n2026-10-06,같은입금자,50000\n2026-10-13,같은입금자,50000");
        var imported=service.importFile(user,property,file);
        assertThat(imported.payments()).hasSize(2);
        var request=new PaymentRequests.Confirm(unit,null,null);
        for(var payment:imported.payments()) service.confirm(user,property,payment.id(),request);
        service.confirm(user,property,imported.payments().getFirst().id(),request);
        assertThat(jdbc.queryForObject("select sum(amount)::text from payments where status='CONFIRMED'",String.class)).isEqualTo("100000");
        assertThat(jdbc.queryForObject("select sum(allocated_amount)::text from payment_allocations where status='ACTIVE'",String.class)).isEqualTo("50000");
        assertThat(service.workspace(user,property).payments()).allMatch(p->p.status().equals("CONFIRMED"));
        assertThat(service.preview(user,property,file).duplicateCount()).isEqualTo(2);
        service.importFile(user,property,file);assertThat(count("payments")).isEqualTo(2);
        clock.set(Instant.parse("2026-11-01T00:00:00Z"));
        assertThat(billing.generate(property,java.time.YearMonth.of(2026,11))).isTrue();
        assertThat(jdbc.queryForObject("select sum(allocated_amount)::text from payment_allocations where status='ACTIVE'",String.class)).isEqualTo("100000");
        var nextCharge=service.workspace(user,property).charges().stream().filter(c->c.unitId().equals(unit)&&c.month().equals("2026-11")).findFirst().orElseThrow();
        assertThat(service.workspace(user,property).payments().stream().flatMap(p->p.allocations().stream()).filter(a->a.chargeId().equals(nextCharge.id()))).hasSize(1);
    }
    @Test void matchingNamesAutoConfirmRepeatedDepositsAndNextMonthUsesAdvanceWithoutManualAction() {
        var file=csv("입금일,입금자명,입금액\n2026-10-06,김대표,50000\n2026-10-13,김가족,50000");
        assertThat(service.preview(user,property,file).rows()).allMatch(p->p.status().equals("PENDING"));
        assertThat(count("payments")).isZero();
        var imported=service.importFile(user,property,file);
        assertThat(imported.payments()).hasSize(2).allMatch(p->p.status().equals("CONFIRMED")&&p.unitId().equals(unit.toString()));
        assertThat(jdbc.queryForObject("select sum(amount)::text from payments where status='CONFIRMED'",String.class)).isEqualTo("100000");
        assertThat(jdbc.queryForObject("select sum(allocated_amount)::text from payment_allocations where status='ACTIVE'",String.class)).isEqualTo("50000");
        assertThat(jdbc.queryForObject("select count(*) from payment_events where action='AUTO_CONFIRMED'",Long.class)).isEqualTo(2);
        service.importFile(user,property,file);assertThat(count("payments")).isEqualTo(2);
        clock.set(Instant.parse("2026-11-01T00:00:00Z"));billing.generate(property,java.time.YearMonth.of(2026,11));
        assertThat(jdbc.queryForObject("select sum(allocated_amount)::text from payment_allocations where status='ACTIVE'",String.class)).isEqualTo("100000");
    }
    @Test void bulkConfirmsExistingUniqueMatchesButLeavesAmbiguousHeldAndDuplicateManualReceipts() {
        var file=csv("입금일,입금자명,입금액\n2026-10-06,새이름,50000\n2026-10-07,동명이인,50000\n2026-10-08,보류할이름,50000");
        var imported=service.importFile(user,property,file);
        var held=imported.payments().stream().filter(p->p.payer().equals("보류할이름")).findFirst().orElseThrow();
        service.hold(user,property,held.id(),"별도 확인 필요");
        resident(unit,"새이름",false);resident(unit,"동명이인",false);resident(otherUnit,"동명이인",false);resident(unit,"보류할이름",false);
        var result=service.confirmMatches(user,property);service.confirmMatches(user,property);
        assertThat(result.payments().stream().filter(p->p.payer().equals("새이름")).findFirst().orElseThrow().status()).isEqualTo("CONFIRMED");
        assertThat(result.payments().stream().filter(p->p.payer().equals("동명이인")).findFirst().orElseThrow().status()).isEqualTo("PENDING");
        assertThat(result.payments().stream().filter(p->p.id().equals(held.id())).findFirst().orElseThrow().status()).isEqualTo("ON_HOLD");
        UUID manual=manual("50000");service.confirm(user,property,manual,new PaymentRequests.Confirm(unit,null,null));
        var duplicate=service.importFile(user,property,bank("김대표","50000")).payments().stream().filter(p->p.payer().equals("김대표")&&p.source().equals("BANK_IMPORT")).findFirst().orElseThrow();
        assertThat(duplicate.status()).isEqualTo("PENDING");
        assertThat(service.confirmMatches(user,property).payments().stream().filter(p->p.id().equals(duplicate.id())).findFirst().orElseThrow().status()).isEqualTo("PENDING");
    }
    @Test void cumulativeConcurrentReceiptsBothConfirmWithoutOverpayingCharge() throws Exception {
        UUID first=manual("50000"),second=manual("50000");var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var results=List.of(first,second).stream().map(id->pool.submit(()->{start.await();service.confirm(user,property,id,new PaymentRequests.Confirm(unit,null,null));return true;})).toList();
            start.countDown();for(var result:results) assertThat(result.get(10,TimeUnit.SECONDS)).isTrue();
        }
        assertThat(jdbc.queryForObject("select count(*) from payments where status='CONFIRMED'",Long.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select sum(allocated_amount)::text from payment_allocations where status='ACTIVE'",String.class)).isEqualTo("50000");
        service.cancel(user,property,first,"잘못 연결한 수납 취소");
        assertThat(jdbc.queryForObject("select sum(allocated_amount)::text from payment_allocations where status='ACTIVE'",String.class)).isEqualTo("50000");
        assertThat(jdbc.queryForObject("select sum(amount)::text from payments where status='CONFIRMED'",String.class)).isEqualTo("50000");
    }
    @Test void failureDuringCumulativeApplicationRollsBackReceiptAndAllAllocations() {
        UUID id=manual("80000");
        jdbc.execute("create function fail_payment_event() returns trigger language plpgsql as $$ begin if NEW.action='CUMULATIVE_APPLIED' then raise exception 'test failure';end if;return NEW;end $$");
        jdbc.execute("create trigger payment_event_failure before insert on payment_events for each row execute function fail_payment_event()");
        assertThatThrownBy(()->service.confirm(user,property,id,new PaymentRequests.Confirm(unit,null,null))).isInstanceOf(RuntimeException.class);
        assertThat(count("payment_allocations")).isZero();
        assertThat(jdbc.queryForObject("select status from payments where id=?",String.class,id)).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject("select count(*) from payment_events where action='CONFIRMED'",Long.class)).isZero();
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
        var p=service.importFile(user,property,bank("확인할입금","50000")).payments().getFirst();
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
    @Test void confirmedReceiptUsesCancellationAndKeepsBankOriginalForReview() {
        var file=bank("김대표","80000");var payment=service.importFile(user,property,file).payments().getFirst();
        assertThatThrownBy(()->service.delete(user,property,payment.id())).isInstanceOf(PaymentException.class)
            .extracting(e->((PaymentException)e).code()).isEqualTo("PAYMENT_DELETE_NOT_ALLOWED");
        assertThat(service.workspace(user,property).payments()).hasSize(1).allMatch(p->p.status().equals("CONFIRMED"));
        var canceled=service.cancel(user,property,payment.id(),"납부 세대 확인 정정");
        assertThat(canceled.payments()).hasSize(2);
        assertThat(canceled.payments().stream().filter(p->p.status().equals("PENDING"))).hasSize(1);
        assertThat(jdbc.queryForObject("select count(*) from payment_allocations where status='ACTIVE'",Long.class)).isZero();
        assertThat(service.preview(user,property,file).duplicateCount()).isEqualTo(1);
        service.confirmMatches(user,property);
        assertThat(service.workspace(user,property).payments()).noneMatch(p->p.status().equals("CONFIRMED"));
    }
    @Test void deleteUnpaidReceiptAllowsSameExcelRowToBeImportedAgainExactlyOnce() {
        var file=bank("확인할이름","50000");var payment=service.importFile(user,property,file).payments().getFirst();
        assertThat(service.delete(user,property,payment.id()).payments()).isEmpty();service.delete(user,property,payment.id());
        assertThat(jdbc.queryForObject("select deleted_by from payments where id=?",UUID.class,payment.id())).isEqualTo(user);
        assertThat(jdbc.queryForObject("select count(*) from payment_events where action='DELETED'",Long.class)).isEqualTo(1);
        assertThat(service.preview(user,property,file).duplicateCount()).isZero();
        assertThat(service.preview(user,property,file).rows()).hasSize(1);
        var reimported=service.importFile(user,property,file);service.importFile(user,property,file);
        assertThat(reimported.payments()).hasSize(1).allMatch(p->p.status().equals("PENDING")&&!p.id().equals(payment.id()));
        assertThat(count("bank_transactions")).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from bank_transactions where deleted_at is null",Long.class)).isEqualTo(1);
        assertThat(service.preview(user,property,file).duplicateCount()).isEqualTo(1);
    }
    @Test void deletePendingHeldAndManualDraftsAndEnforceScope() {
        var pending=service.importFile(user,property,bank("미확인","10000")).payments().getFirst();
        assertThatThrownBy(()->service.delete(user,UUID.randomUUID(),pending.id())).isInstanceOf(AuthException.class);
        service.hold(user,property,pending.id(),"확인");service.delete(user,property,pending.id());
        UUID draft=manual("50000");service.delete(user,property,draft);
        assertThat(service.workspace(user,property).payments()).isEmpty();
        var newPending=service.importFile(user,property,bank("또다른미확인","20000")).payments().getFirst();
        service.delete(user,property,newPending.id());assertThat(service.workspace(user,property).payments()).isEmpty();
    }
    @Test void failedDeleteRollsBackDraftAndBankDeduplicationKeyTogether() {
        var file=bank("미확인","50000");var payment=service.importFile(user,property,file).payments().getFirst();
        jdbc.execute("create function fail_payment_event() returns trigger language plpgsql as $$ begin if NEW.action='DELETED' then raise exception 'test failure';end if;return NEW;end $$");
        jdbc.execute("create trigger payment_event_failure before insert on payment_events for each row execute function fail_payment_event()");
        assertThatThrownBy(()->service.delete(user,property,payment.id())).isInstanceOf(RuntimeException.class);
        assertThat(service.workspace(user,property).payments()).hasSize(1).allMatch(p->p.status().equals("PENDING"));
        assertThat(jdbc.queryForObject("select count(*) from bank_transactions where deleted_at is null",Long.class)).isEqualTo(1);
        assertThat(service.preview(user,property,file).duplicateCount()).isEqualTo(1);
    }
    @Test void oldDepositCanBeManuallyConfirmedAgainstCurrentUnitWithoutReceiptMonthBill() {
        var file=csv("입금일,입금자명,입금액\n2026-08-20,103-302(8),50000");
        var payment=service.importFile(user,property,file).payments().getFirst();
        assertThat(payment.unitId()).isEmpty();assertThat(payment.status()).isEqualTo("PENDING");
        var confirmed=service.confirm(user,property,payment.id(),new PaymentRequests.Confirm(unit,null,null));
        assertThat(confirmed.payments().getFirst().status()).isEqualTo("CONFIRMED");
        assertThat(confirmed.payments().getFirst().payer()).isEqualTo("103-302(8)");
        assertThat(confirmed.payments().getFirst().allocations()).hasSize(1);
    }
    @Test void selectedDeletionIsAtomicAndDeletedRowsCanBeReimported() {
        var file=csv("입금일,입금자명,입금액\n2026-08-01,미확인하나,50000\n2026-08-02,미확인둘,50000");
        var imported=service.importFile(user,property,file);
        var ids=imported.payments().stream().map(PaymentResponse.Payment::id).toList();
        UUID confirmed=manual("50000");service.confirm(user,property,confirmed,new PaymentRequests.Confirm(unit,null,null));
        assertThatThrownBy(()->service.deleteMany(user,property,new PaymentRequests.DeleteMany(List.of(ids.getFirst(),confirmed)))).isInstanceOf(PaymentException.class);
        assertThat(service.preview(user,property,file).duplicateCount()).isEqualTo(2);
        assertThat(service.workspace(user,property).payments()).hasSize(3);
        service.deleteMany(user,property,new PaymentRequests.DeleteMany(ids));
        assertThat(service.preview(user,property,file).rows()).hasSize(2);
        assertThat(service.importFile(user,property,file).payments()).hasSize(3);
    }
    @Test void migrationReleasesPreviouslyDeletedOrphanBankKeysAndKeepsActiveReceipts() {
        var file=csv("입금일,입금자명,입금액\n2026-08-01,삭제할입금,50000\n2026-08-02,유지할입금,50000");
        var imported=service.importFile(user,property,file);
        var deleted=imported.payments().stream().filter(p->p.payer().equals("삭제할입금")).findFirst().orElseThrow();
        service.delete(user,property,deleted.id());
        String schema="bank_reimport_"+UUID.randomUUID().toString().replace("-","");
        var previous=org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(),POSTGRES.username(),"").schemas(schema).defaultSchema(schema).target("20261016120311").load();previous.migrate();
        for(String table:List.of("users","properties","buildings","units","bank_accounts","residents","bank_transactions","payments")) {
            String columns=jdbc.queryForObject("select string_agg(quote_ident(column_name),',' order by ordinal_position) from information_schema.columns where table_schema=? and table_name=?",String.class,schema,table);
            jdbc.execute("insert into "+schema+"."+table+"("+columns+") select "+columns+" from public."+table);
        }
        var upgraded=org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(),POSTGRES.username(),"").schemas(schema).defaultSchema(schema).load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(5);upgraded.validate();
        assertThat(jdbc.queryForObject("select count(*) from "+schema+".bank_transactions where deleted_at is not null",Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from "+schema+".bank_transactions where deleted_at is null",Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from "+schema+".payments where deleted_at is null",Long.class)).isEqualTo(1);
        String columns="property_id,bank_account_id,transaction_date,amount,payer_name_encrypted,payer_name_hmac,memo_encrypted,bank_reference,deduplication_key,imported_by,imported_at";
        jdbc.execute("insert into "+schema+".bank_transactions(id,"+columns+") select gen_random_uuid(),"+columns+" from "+schema+".bank_transactions where deleted_at is not null");
        assertThatThrownBy(()->jdbc.execute("insert into "+schema+".bank_transactions(id,"+columns+") select gen_random_uuid(),"+columns+" from "+schema+".bank_transactions where deleted_at is not null")).isInstanceOf(org.springframework.dao.DataAccessException.class);
        jdbc.execute("drop schema "+schema+" cascade");
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
            copyPreviousTable(schema,table);
        var before=jdbc.queryForList("select * from "+schema+".charges order by id");
        var upgraded=org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(),POSTGRES.username(),"")
            .schemas(schema).defaultSchema(schema).load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(8);upgraded.validate();
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
                copyPreviousTable(schema,table);
            String columns="id,property_id,bank_account_id,transaction_date,amount,payer_name_encrypted,payer_name_hmac,"
                +"memo_encrypted,bank_reference,deduplication_key,imported_by,imported_at";
            jdbc.execute("insert into "+schema+".bank_transactions("+columns+") select "+columns+" from public.bank_transactions");
            for(String table:List.of("payments","payment_allocations","payment_events")) {
                String previousColumns=jdbc.queryForObject("select string_agg(quote_ident(column_name),',' order by ordinal_position) from information_schema.columns where table_schema=? and table_name=?",String.class,schema,table);
                jdbc.execute("insert into "+schema+"."+table+"("+previousColumns+") select "+previousColumns+" from public."+table);
            }
            return null;
        });
        var receipts=jdbc.queryForList("select * from "+schema+".payments order by id");
        receipts.forEach(row->{row.put("deleted_at",null);row.put("deleted_by",null);
            row.put("receipt_type","HOUSEHOLD");row.put("income_category_encrypted",null);row.put("income_note_encrypted",null);});
        var applied=jdbc.queryForList("select * from "+schema+".payment_allocations order by id");
        var originals=jdbc.queryForList("select id,amount,payer_name_encrypted,deduplication_key from "+schema+".bank_transactions order by id");
        var upgraded=org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(),POSTGRES.username(),"")
            .schemas(schema).defaultSchema(schema).load();
        assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(7);upgraded.validate();
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
    /** 적용 전 스키마의 컬럼만 복사해 후속 Migration으로 추가된 감사 컬럼을 미리 주입하지 않습니다. */
    private void copyPreviousTable(String schema,String table) {
        String columns=jdbc.queryForObject("select string_agg(quote_ident(column_name),',' order by ordinal_position) from information_schema.columns where table_schema=? and table_name=?",String.class,schema,table);
        jdbc.execute("insert into "+schema+"."+table+"("+columns+") select "+columns+" from public."+table);
    }

}
