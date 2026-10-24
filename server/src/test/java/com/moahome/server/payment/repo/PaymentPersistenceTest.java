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
import com.moahome.server.banking.dto.BankAccountSettings;
import com.moahome.server.banking.dto.BankingBalanceRequests;
import com.moahome.server.banking.dto.BankingRequests;

@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(FlywayAutoConfiguration.class)
@Import({ com.moahome.server.banking.service.BankBalanceCheckService.class,
        com.moahome.server.banking.service.IncomeAllocationService.class,
        com.moahome.server.banking.service.BankAccountService.class,
        com.moahome.server.banking.service.BankingBalanceService.class,
        com.moahome.server.banking.service.BankingService.class,
        com.moahome.server.expense.service.ExpenseService.class,
        com.moahome.server.payment.service.CumulativePaymentService.class, PaymentService.class,
        BankTransactionReader.class, BillingTemplates.class, BillingGenerationService.class,
        PropertyRegistrationService.class, RegistrationOpeningService.class, PropertyRegistrationLock.class,
        ManagementAccessService.class, UserService.class, OpeningBalanceService.class,
        com.moahome.server.membership.service.MemberManagementService.class,
        com.moahome.server.membership.service.MembershipRequestService.class, ResidentRegistrationService.class,
        ResidentManagementService.class, ResidentListService.class, PaymentPersistenceTest.TestBeans.class })
@ActiveProfiles("database-test")
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class PaymentPersistenceTest {
	static final PostgresTestServer POSTGRES = new PostgresTestServer();

	@Autowired
	PaymentService service;

	@Autowired
	com.moahome.server.banking.service.BankAccountService bankAccountSettings;

	@Autowired
	com.moahome.server.banking.service.BankingService banking;

	@Autowired
	com.moahome.server.banking.service.BankingBalanceService cashBalances;

	@Autowired
	com.moahome.server.banking.service.BankBalanceCheckService balanceChecks;

	@Autowired
	OpeningBalanceService opening;

	@Autowired
	com.moahome.server.membership.service.MemberManagementService memberManagement;

	@Autowired
	com.moahome.server.membership.service.MembershipRequestService signupRequests;

	@Autowired
	ResidentManagementService residentManagement;

	@Autowired
	BillingGenerationService billing;

	@Autowired
	PropertyRegistrationService registration;

	@Autowired
	UserRepository users;

	@Autowired
	MutableClock clock;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	PlatformTransactionManager transactionManager;

	UUID user, property, unit, otherUnit, charge;

	@DynamicPropertySource
	static void infrastructure(DynamicPropertyRegistry r) {
		r.add("spring.datasource.url", POSTGRES::jdbcUrl);
		r.add("spring.datasource.username", POSTGRES::username);
		r.add("spring.datasource.password", () -> "");
	}

	@BeforeEach
	void prepare() {
		clock.set(Instant.parse("2026-10-15T00:00:00Z"));
		user = users.saveAndFlush(User.create("관리자", null)).getId();
		var request = RegistrationFixtures.withUnits(RegistrationFixtures.request(UUID.randomUUID(), false),
		    List.of(new UnitInput(null, "101", null, 1, "ACTIVE"), new UnitInput(null, "202", null, 2, "ACTIVE")));
		property = registration.register(user, request).response().property().id();
		jdbc.update("update bank_accounts set bank_code='081' where property_id=?", property);
		// 수납 회귀 테스트는 운영 개시 후를 준비합니다. 도입 절차는 별도 인계 시나리오에서 실제 서비스로 검증합니다.
		jdbc.update(
		    "update properties set management_started_at=created_at,first_billing_month=date '2026-10-01' where id=?",
		    property);
		billing.generate(property, YearMonth.of(2026, 10));
		unit = jdbc.queryForObject("select id from units where property_id=? and unit_number='101'", UUID.class,
		    property);
		otherUnit = jdbc.queryForObject("select id from units where property_id=? and unit_number='202'", UUID.class,
		    property);
		charge = jdbc.queryForObject("select id from charges where property_id=? and unit_id=?", UUID.class, property,
		    unit);
		resident(unit, "김대표", true);
		resident(otherUnit, "이대표", true);
		resident(unit, "김가족", false);
	}

	@AfterEach
	void cleanup() {
		jdbc.execute("drop function if exists fail_payment_event() cascade");
		jdbc.execute("drop function if exists fail_opening_application() cascade");
		jdbc.execute(
		    "truncate payment_events,payment_allocations,payments,bank_transactions,charge_items,charges,billing_periods,"
		        + "property_registration_results,property_members,fee_template_items,fee_templates,bank_accounts,unit_residents,residents,"
		        + "units,buildings,properties,social_accounts,users cascade");
	}

	/** 직접 확인은 실제 잔액 출처만 바꾸며 취소·재시도 후에도 원장과 최초 잔액은 그대로입니다. */
	@Test
	void bankBalanceChecksPreserveLedgerAndCancelWithoutDeletingHistory() {
		UUID account = bankAccountSettings.read(user, property).accountId();
		var before = cashBalances.workspace(user, property, "2026-10");
		var input = new com.moahome.server.banking.dto.BankBalanceCheckRequests.Create(UUID.randomUUID(), account,
		    "2338114", OffsetDateTime.parse("2026-10-14T09:20:00+09:00"), "BANK_APP", "직접 확인");
		balanceChecks.create(user, property, input);
		balanceChecks.create(user, property, input);
		var after = cashBalances.workspace(user, property, "2026-10");
		assertThat(after.accounts()).singleElement().satisfies(row -> {
			assertThat(row.balance()).isEqualTo("2338114");
			assertThat(row.confirmation().source()).isEqualTo("DIRECT_CHECK");
			assertThat(row.comparisonTimeDifferent()).isTrue();
		});
		assertThat(after.buildings()).isEqualTo(before.buildings());
		assertThat(after.entries()).isEqualTo(before.entries());
		assertThat(count("bank_transactions")).isZero();
		assertThat(count("bank_opening_balances")).isZero();
		assertThat(count("payments")).isZero();
		assertThat(balanceChecks.history(user, property, account).checks()).hasSize(1);
		assertThat(cashBalances.workspace(user, property, "2026-09").bankBalance()).isNull();
		assertThatThrownBy(() -> jdbc.update("update bank_balance_checks set balance_amount=1 where id=?", input.id()))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
		var cancellation = new com.moahome.server.banking.dto.BankBalanceCheckRequests.Cancel(UUID.randomUUID(),
		    "금액 오입력");
		balanceChecks.cancel(user, property, input.id(), cancellation);
		balanceChecks.cancel(user, property, input.id(), cancellation);
		balanceChecks.create(user, property, input);
		assertThat(balanceChecks.history(user, property, account).checks()).singleElement().satisfies(row -> {
			assertThat(row.canceledAt()).isNotNull();
			assertThat(row.amount()).isEqualTo("2338114");
			assertThat(row.cancelReason()).isEqualTo("금액 오입력");
		});
		assertThat(cashBalances.workspace(user, property, "2026-10").bankBalance()).isNull();
		assertThatThrownBy(() -> jdbc.update("delete from bank_balance_checks where id=?", input.id()))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
	}

	@Test
	void bankBalanceChecksRejectFutureForeignAccountAndChangedRetry() {
		UUID account = bankAccountSettings.read(user, property).accountId();
		var input = new com.moahome.server.banking.dto.BankBalanceCheckRequests.Create(UUID.randomUUID(), account,
		    "100", OffsetDateTime.parse("2026-10-14T09:20:00+09:00"), "OTHER", null);
		balanceChecks.create(user, property, input);
		assertThatThrownBy(() -> balanceChecks.create(user, property,
		    new com.moahome.server.banking.dto.BankBalanceCheckRequests.Create(input.id(), account, "101",
		        input.checkedAt(), "OTHER", null)))
		    .isInstanceOfSatisfying(PaymentException.class, e -> assertThat(e.code()).isEqualTo("BANK_CHECK_CONFLICT"));
		assertThatThrownBy(() -> balanceChecks.create(user, property,
		    new com.moahome.server.banking.dto.BankBalanceCheckRequests.Create(UUID.randomUUID(), account, "100",
		        OffsetDateTime.now(clock).plusSeconds(1), "OTHER", null)))
		    .isInstanceOfSatisfying(PaymentException.class,
		        e -> assertThat(e.code()).isEqualTo("INVALID_BANK_CHECK_TIME"));
		assertThatThrownBy(() -> balanceChecks.history(user, property, UUID.randomUUID()))
		    .isInstanceOf(AuthException.class);
		assertThat(count("bank_balance_checks")).isEqualTo(1);
	}

	@AfterAll
	static void close() {
		POSTGRES.close();
	}

	void resident(UUID unit, String name, boolean rep) {
		UUID resident = UUID.randomUUID();
		jdbc.update(
		    "insert into residents(id,property_id,name,status,created_at,updated_at) values (?,?,?,'ACTIVE',now(),now())",
		    resident, property, name);
		jdbc.update(
		    "insert into unit_residents(id,property_id,resident_id,unit_id,relation_type,status,is_household_rep,created_at,updated_at) "
		        + "values (?,?,?,?,'OTHER','ACTIVE',?,now(),now())",
		    UUID.randomUUID(), property, resident, unit, rep);
	}

	UUID manual(String amount) {
		UUID id = UUID.randomUUID();
		service.manual(user, property, new PaymentRequests.Manual(id, unit, LocalDate.of(2026, 10, 15), amount));
		return id;
	}

	PaymentRequests.Confirm confirm(String amount) {
		return new PaymentRequests.Confirm(unit, List.of(new PaymentRequests.Allocation(charge, amount)), null);
	}

	MockMultipartFile csv(String body) {
		return new MockMultipartFile("file", "은행.csv", "text/csv",
		    body.getBytes(java.nio.charset.StandardCharsets.UTF_8));
	}

	/** 기존 업무 시나리오의 금액·상대를 유지하면서 카카오 계좌에는 검증된 구분·거래금액 양식을 전달합니다. */
	private MockMultipartFile kakaoFile(MockMultipartFile source) {
		String body;
		try {
			body = new String(source.getBytes(), java.nio.charset.StandardCharsets.UTF_8);
		} catch (java.io.IOException exception) {
			throw new java.io.UncheckedIOException(exception);
		}
		StringBuilder converted = new StringBuilder("거래일시,구분,거래금액,거래 후 잔액,거래구분,내용,메모\n");
		for (String line : body.lines().skip(1).toList()) {
			String[] cells = line.split(",", -1);
			if (cells[0].equals("거래일시"))
				continue;
			boolean expense = new java.math.BigDecimal(cells[2]).signum() > 0;
			converted.append(cells[0]).append(',').append(expense ? "출금" : "입금").append(',')
			    .append(expense ? cells[2] : cells[3]).append(',').append(cells.length > 4 ? cells[4] : "0")
			    .append(",이체,").append(cells[1]).append(",\n");
		}
		return csv(converted.toString());
	}

	MockMultipartFile bank(String payer, String amount) {
		return csv("입금일,입금자명,입금액\n2026-10-15," + payer + "," + amount);
	}

	long count(String table) {
		return jdbc.queryForObject("select count(*) from " + table, Long.class);
	}

	/** 새 초기 설정은 임시 참조를 실제 ID로 연결하고 등록·잔액·첫 부과를 한 번만 저장합니다. */
	@Test
	void registersOpeningBalancesAndManagementStartAtomicallyAndReplaysTheSameSnapshot() {
		var request = registrationOpeningRequest(true, "2026-10");
		var result = registration.register(user, request).response();
		var target = result.property().id();
		assertThat(result.managementStart().cutoffDate()).isEqualTo(LocalDate.of(2026, 9, 30));
		assertThat(opening.workspace(user, target).managementStarted()).isTrue();
		assertThat(opening.workspace(user, target).units())
		    .extracting(com.moahome.server.billing.dto.OpeningBalanceResponse.Unit::receivable)
		    .containsExactlyInAnyOrder("10000", "0");
		assertThat(
		    jdbc.queryForObject("select count(*) from charges where property_id=? and charge_type='OPENING_RECEIVABLE'",
		        Long.class, target))
		    .isEqualTo(1);
		assertThat(jdbc.queryForObject(
		    "select count(*) from charges where property_id=? and charge_type<>'OPENING_RECEIVABLE'", Long.class,
		    target)).isEqualTo(1);
		assertThat(
		    jdbc.queryForObject("select count(*) from credit_applications where property_id=?", Long.class, target))
		    .isEqualTo(1);
		assertThat(jdbc.queryForObject("select count(*) from payments where property_id=?", Long.class, target))
		    .isZero();
		var cash = cashBalances.workspace(user, target, "2026-10");
		assertThat(cash.bankBalance()).isEqualTo("350000");
		assertThat(cash.bankAsOf()).contains("2026-09-30");
		assertThat(cash.buildings())
		    .extracting(com.moahome.server.banking.dto.BankingBalanceResponse.Building::openingBalance)
		    .containsExactlyInAnyOrder("100000", "200000");
		assertThat(registration.register(user, request).created()).isFalse();
		assertThat(registration.getResult(user, request.requestId())).isEqualTo(result);
		assertThat(
		    jdbc.queryForObject("select count(*) from opening_balance_batches where property_id=?", Long.class, target))
		    .isEqualTo(1);
		var changed = request.openingBalances();
		var other = new com.moahome.server.property.dto.RegistrationOpeningInput(changed.cutoffDate(),
		    changed.firstBillingMonth(), changed.units(),
		    List.of(new com.moahome.server.property.dto.RegistrationOpeningInput.AccountOpening(0, "350001")),
		    changed.cashCutoffDate(), changed.buildings());
		var conflict = new com.moahome.server.property.dto.PropertyRegistrationRequest(request.requestId(),
		    request.basicInfo(), request.buildings(), request.units(), request.bankAccounts(), request.feeItems(),
		    request.administrator(), other);
		assertThatThrownBy(() -> registration.register(user, conflict))
		    .isInstanceOf(com.moahome.server.property.exception.RegistrationException.class);
	}

	/** 동 없는 등록과 미래 첫 부과월도 저장하되 현재 월 청구나 가상 동은 만들지 않습니다. */
	@Test
	void registersWithoutBuildingsAndDefersFutureFirstBillingMonth() {
		var request = registrationOpeningRequest(false, "2026-11");
		var target = registration.register(user, request).response().property().id();
		assertThat(opening.workspace(user, target).managementStarted()).isTrue();
		assertThat(
		    jdbc.queryForObject("select count(*) from building_cash_openings where property_id=?", Long.class, target))
		    .isZero();
		assertThat(jdbc.queryForObject("select count(*) from buildings where property_id=?", Long.class, target))
		    .isZero();
		assertThat(jdbc.queryForObject("select count(*) from billing_periods where property_id=?", Long.class, target))
		    .isZero();
		assertThat(cashBalances.workspace(user, target, "2026-10").bankBalance()).isEqualTo("350000");
	}

	/** 초기 다중 통장의 각 동 보유금은 통장별로 독립 저장하며 같은 최종 등록 재시도는 중복하지 않습니다. */
	@Test
	void registrationStartsEveryAccountBuildingBalanceWithoutCombiningOwnership() {
		var base = registrationOpeningRequest(true, "2026-10");
		var old = base.openingBalances();
		var accountInputs = new ArrayList<>(base.bankAccounts());
		accountInputs.add(new com.moahome.server.property.dto.PropertyRegistrationRequest.BankAccountInput("090",
		    "카카오뱅크", "3333012345678", "관리단", false, "예비비"));
		var amounts = new com.moahome.server.property.dto.RegistrationOpeningInput(old.cutoffDate(),
		    old.firstBillingMonth(), old.units(),
		    List.of(new com.moahome.server.property.dto.RegistrationOpeningInput.AccountOpening(0, "350000"),
		        new com.moahome.server.property.dto.RegistrationOpeningInput.AccountOpening(1, "400000")),
		    old.cashCutoffDate(),
		    List.of(new com.moahome.server.property.dto.RegistrationOpeningInput.BuildingOpening(0, "a", "100000"),
		        new com.moahome.server.property.dto.RegistrationOpeningInput.BuildingOpening(0, "b", "200000"),
		        new com.moahome.server.property.dto.RegistrationOpeningInput.BuildingOpening(1, "a", "250000"),
		        new com.moahome.server.property.dto.RegistrationOpeningInput.BuildingOpening(1, "b", "150000")));
		var input = new com.moahome.server.property.dto.PropertyRegistrationRequest(base.requestId(), base.basicInfo(),
		    base.buildings(), base.units(), accountInputs, base.feeItems(), base.administrator(), amounts);
		UUID target = registration.register(user, input).response().property().id();
		registration.register(user, input);
		assertThat(jdbc.queryForObject(
		    "select count(*) from building_cash_openings where property_id=? and bank_account_id is not null",
		    Long.class, target)).isEqualTo(4);
		var balance = cashBalances.workspace(user, target, "2026-10");
		assertThat(balance.accounts()).hasSize(2);
		assertThat(balance.buildings()).extracting(row -> row.balance()).containsExactlyInAnyOrder("350000",
		    "350000");
		assertThat(balance.bankBalance()).isEqualTo("750000");
	}

	/** 선납 충당 중 실패하면 등록·보유금·인계·성공 결과 모두 롤백하고 같은 본문으로 재시도할 수 있습니다. */
	@Test
	void rollsBackRegistrationWhenOpeningConfirmationFailsAndAllowsSameRequestRetry() {
		var request = registrationOpeningRequest(true, "2026-10");
		long propertyCount = count("properties"), cashCount = count("building_cash_openings"),
		    batchCount = count("opening_balance_batches");
		jdbc.execute(
		    "create function fail_opening_application() returns trigger language plpgsql as $$ begin raise exception 'opening failure'; end $$");
		jdbc.execute(
		    "create trigger fail_opening_application before insert on credit_applications for each row execute function fail_opening_application()");
		assertThatThrownBy(() -> registration.register(user, request))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
		assertThat(count("properties")).isEqualTo(propertyCount);
		assertThat(count("building_cash_openings")).isEqualTo(cashCount);
		assertThat(count("opening_balance_batches")).isEqualTo(batchCount);
		assertThatThrownBy(() -> registration.getResult(user, request.requestId()))
		    .isInstanceOf(com.moahome.server.property.exception.RegistrationException.class);
		jdbc.execute("drop function fail_opening_application() cascade");
		assertThat(registration.register(user, request).response().managementStart()).isNotNull();
	}

	/** 기존 등록 계약을 유지하며 새 초기 설정에만 명시적인 인계 정보를 덧붙입니다. */
	private com.moahome.server.property.dto.PropertyRegistrationRequest registrationOpeningRequest(boolean hasBuildings,
	    String firstMonth) {
		var base = RegistrationFixtures.request(UUID.randomUUID(), hasBuildings);
		var opening = new com.moahome.server.property.dto.RegistrationOpeningInput(LocalDate.of(2026, 9, 30),
		    firstMonth,
		    List.of(
		        new com.moahome.server.property.dto.RegistrationOpeningInput.UnitOpening(hasBuildings ? "a" : null,
		            "201", "10000", "7000"),
		        new com.moahome.server.property.dto.RegistrationOpeningInput.UnitOpening(hasBuildings ? "b" : null,
		            "202", "0", "0")),
		    List.of(new com.moahome.server.property.dto.RegistrationOpeningInput.AccountOpening(0, "350000")),
		    hasBuildings ? LocalDate.of(2026, 9, 30) : null,
		    hasBuildings
		        ? List.of(new com.moahome.server.property.dto.RegistrationOpeningInput.BuildingOpening("a", "100000"),
		            new com.moahome.server.property.dto.RegistrationOpeningInput.BuildingOpening("b", "200000"))
		        : List.of());
		return new com.moahome.server.property.dto.PropertyRegistrationRequest(base.requestId(), base.basicInfo(),
		    base.buildings(), base.units(), base.bankAccounts(), base.feeItems(),
		    new com.moahome.server.property.dto.PropertyRegistrationRequest.AdministratorInput("EXTERNAL", null, null,
		        null, null),
		    opening);
	}

	/** 계좌 정보 정정은 보호된 번호만 바꾸고 거래·수납·잔고 원본과 계좌 ID를 유지합니다. */
	@Test
	void correctsAccountDetailsWithoutReassigningExistingCashAndRejectsStaleUpdates() {
		service.importFile(user, property, bank("김대표", "50000"));
		var before = bankAccountSettings.read(user, property);
		List<Map<String, Object>> transactionBefore = jdbc
		    .queryForList("select * from bank_transactions where property_id=?", property);
		List<Map<String, Object>> paymentsBefore = jdbc.queryForList("select * from payments where property_id=?",
		    property);
		Map<String, Object> metadataBefore = jdbc.queryForMap(
		    "select valid_from,valid_to,is_primary,status from bank_accounts where id=?", before.accountId());
		var numberBefore = jdbc.queryForObject("select account_number_encrypted from bank_accounts where id=?",
		    String.class, before.accountId());
		var request = new com.moahome.server.banking.dto.BankAccountSettings.Request(before.accountId(),
		    before.updatedAt(), "004", "국민은행", "000-9876-5432", "정정 예금주");
		var saved = bankAccountSettings.correct(user, property, request);
		assertThat(saved.accountId()).isEqualTo(before.accountId());
		assertThat(saved.accountNumber()).isEqualTo("00098765432");
		assertThat(saved.holderName()).isEqualTo("정정 예금주");
		assertThat(saved.updatedAt()).isAfter(before.updatedAt());
		assertThat(bankAccountSettings.read(user, property)).isEqualTo(saved);
		assertThat(bankAccountSettings.correct(user, property, request)).isEqualTo(saved);
		assertThat(jdbc.queryForList("select * from bank_transactions where property_id=?", property))
		    .isEqualTo(transactionBefore);
		assertThat(jdbc.queryForList("select * from payments where property_id=?", property)).isEqualTo(paymentsBefore);
		assertThat(jdbc.queryForMap("select valid_from,valid_to,is_primary,status from bank_accounts where id=?",
		    before.accountId())).isEqualTo(metadataBefore);
		var numberAfter = jdbc.queryForObject("select account_number_encrypted from bank_accounts where id=?",
		    String.class, before.accountId());
		assertThat(numberAfter).isNotEqualTo(numberBefore).doesNotContain("00098765432");
		var stale = new com.moahome.server.banking.dto.BankAccountSettings.Request(before.accountId(),
		    before.updatedAt(), "004", "국민은행", "00011112222", "다른 정정");
		assertThatThrownBy(() -> bankAccountSettings.correct(user, property, stale)).isInstanceOfSatisfying(
		    PaymentException.class, e -> assertThat(e.code()).isEqualTo("BANK_ACCOUNT_CONFLICT"));
		var next = new com.moahome.server.banking.dto.BankAccountSettings.Request(saved.accountId(), saved.updatedAt(),
		    "004", "국민은행", saved.accountNumber(), "최종 예금주");
		assertThat(bankAccountSettings.correct(user, property, next).holderName()).isEqualTo("최종 예금주");

	}

	/** 계좌 원문 조회와 정정은 세대·부담당자 권한으로 실행할 수 없습니다. */
	@Test
	void rejectsAccountCorrectionByResidentBeforeReadingAccountDetails() {
		var original = bankAccountSettings.read(user, property);
		jdbc.update("update property_members set role='RESIDENT' where property_id=? and user_id=?", property, user);
		var request = new com.moahome.server.banking.dto.BankAccountSettings.Request(original.accountId(),
		    original.updatedAt(), "004", "국민은행", "00099998888", "정정 예금주");
		assertThatThrownBy(() -> bankAccountSettings.read(user, property)).isInstanceOf(AuthException.class);
		assertThatThrownBy(() -> bankAccountSettings.correct(user, property, request))
		    .isInstanceOf(AuthException.class);
		assertThat(
		    jdbc.queryForObject("select bank_code from bank_accounts where id=?", String.class, original.accountId()))
		    .isEqualTo(original.bankCode());
	}

	/** 신규 등록·세대 추가·스케줄은 관리 시작 확정 전에는 청구를 생성하지 않습니다. */
	UUID newHandoverTarget() {
		var request = RegistrationFixtures.withUnits(RegistrationFixtures.request(UUID.randomUUID(), false),
		    List.of(new UnitInput(null, "101", null, 1, "ACTIVE"), new UnitInput(null, "102", null, 1, "ACTIVE"),
		        new UnitInput(null, "103", null, 1, "ACTIVE"), new UnitInput(null, "104", null, 1, "ACTIVE")));
		property = registration.register(user, request).response().property().id();
		unit = jdbc.queryForObject("select id from units where property_id=? and unit_number='101'", UUID.class,
		    property);
		otherUnit = jdbc.queryForObject("select id from units where property_id=? and unit_number='102'", UUID.class,
		    property);
		resident(unit, "인계대표", true);
		resident(otherUnit, "선납대표", true);
		assertThat(jdbc.queryForObject("select count(*) from charges where property_id=?", Long.class, property))
		    .isZero();
		assertThat(billing.generate(property, YearMonth.of(2026, 10))).isFalse();
		billing.supplementCurrentMonth(property);
		assertThat(jdbc.queryForObject("select count(*) from charges where property_id=?", Long.class, property))
		    .isZero();
		return property;
	}

	com.moahome.server.billing.dto.OpeningBalanceResponse draftHandover(LocalDate cutoff, String first) {
		var current = opening.workspace(user, property);
		var input = new com.moahome.server.billing.dto.OpeningBalanceRequest(
		    current.batch() == null ? null : current.batch().id(),
		    current.batch() == null ? null : current.batch().revision(), cutoff, first,
		    current.units().stream().map(u -> {
			    String number = jdbc.queryForObject("select unit_number from units where id=?", String.class,
			        u.unitId());
			    return new com.moahome.server.billing.dto.OpeningBalanceRequest.UnitInput(u.unitId(),
			        number.equals("101") ? "100000" : "0",
			        number.equals("102") ? "30000" : number.equals("103") ? "80000" : "0", null,
			        number.equals("101") ? "이전 임차인 확인 필요" : null);
		    }).toList(),
		    current.accounts().stream().map(
		        a -> new com.moahome.server.billing.dto.OpeningBalanceRequest.AccountInput(a.accountId(), "2000000"))
		        .toList());
		return opening.save(user, property, input);
	}

	void confirmHandover(com.moahome.server.billing.dto.OpeningBalanceResponse draft) {
		opening.confirm(user, property, draft.batch().id(), draft.batch().revision());
	}

	java.math.BigDecimal due(UUID target) {
		return jdbc.queryForObject("select coalesce(sum(c.total_amount"
		    + "-(select coalesce(sum(a.allocated_amount),0) from payment_allocations a where a.charge_id=c.id and a.status='ACTIVE')"
		    + "-(select coalesce(sum(a.amount),0) from credit_applications a where a.charge_id=c.id and a.status='ACTIVE')),0)"
		    + " from charges c where c.property_id=? and c.unit_id=? and c.status='ISSUED' and c.total_amount>0",
		    java.math.BigDecimal.class, property, target);
	}

	/** 입출금을 함께 가져와도 원본은 한 건씩 남고 전기료는 외부 부담을 포함해 정확히 배분됩니다. */
	@Test
	void bankingImportsSelectedDirectionsWithExternalQuarterAllocationAndRetry() {
		UUID first = UUID.randomUUID(), second = UUID.randomUUID();
		jdbc.update(
		    "insert into buildings(id,property_id,name,sort_order,status,created_at,updated_at) values (?,?,?,?,'ACTIVE',now(),now())",
		    first, property, "102동", 0);
		jdbc.update(
		    "insert into buildings(id,property_id,name,sort_order,status,created_at,updated_at) values (?,?,?,?,'ACTIVE',now(),now())",
		    second, property, "103동", 1);
		var file = csv(
		    "거래일시,적요,출금액,입금액,잔액\n2026-10-15 08:00:00,김대표,0,50000,500000\n2026-10-15 09:00:00,07전기요금,182660,0,317340\n2026-10-15 10:00:00,청소,160000,0,157340");
		var preview = banking.preview(user, property, file);
		assertThat(preview.rows()).hasSize(3);
		assertThat(count("bank_transactions")).isZero();
		var income = preview.rows().get(0);
		var power = preview.rows().get(1);
		var expense = new com.moahome.server.banking.dto.BankingRequests.Expense("전기료", null, "RATIO", true,
		    List.of(new com.moahome.server.banking.dto.BankingRequests.Allocation(first, null, null, "25"),
		        new com.moahome.server.banking.dto.BankingRequests.Allocation(second, null, null, "25"),
		        new com.moahome.server.banking.dto.BankingRequests.Allocation(null, "외부 101동", null, "50")));
		var selected = new com.moahome.server.banking.dto.BankingRequests.Import(
		    List.of(new com.moahome.server.banking.dto.BankingRequests.Selection(income.id(), null, null, null, null),
		        new com.moahome.server.banking.dto.BankingRequests.Selection(power.id(), null, null, null, expense)));
		var saved = banking.upload(user, property, file, selected);
		assertThat(saved.rows()).hasSize(2);
		assertThat(count("payments")).isEqualTo(1);
		assertThat(count("expenses")).isEqualTo(1);
		assertThat(
		    saved.rows().stream().filter(r -> r.expense() != null).findFirst().orElseThrow().expense().allocations())
		    .extracting(com.moahome.server.banking.dto.BankingResponse.Allocation::amount)
		    .containsExactly("45665", "45665", "91330");
		assertThat(saved.rules()).hasSize(1);
		assertThat(saved.rules().getFirst().category()).isEqualTo("전기료");
		assertThat(service.workspace(user, property).payments().getFirst().status()).isEqualTo("CONFIRMED");
		banking.upload(user, property, file, selected);
		assertThat(count("bank_transactions")).isEqualTo(2);
		assertThat(count("expenses")).isEqualTo(1);
		var again = banking.preview(user, property, file);
		assertThat(again.rows()).hasSize(1);
		assertThat(again.duplicateCount()).isEqualTo(2);
		assertThat(jdbc.queryForObject("select category_encrypted from expenses", String.class)).doesNotContain("전기료");
		assertThatThrownBy(
		    () -> jdbc.update("update expense_allocations set allocated_amount=1 where building_id=?", first))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
		assertThatThrownBy(() -> jdbc.update("delete from expense_allocations where building_id=?", first))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
	}

	/** 시작 보유금·실제 입금·1/4 지출·부분 회수와 취소를 실제 PostgreSQL에서 함께 검증합니다. */
	@Test
	void buildingBalancesKeepCashSnapshotsAndRecoverExternalSharesWithoutDoubleCounting() {
		// 이 시나리오는 7월부터 사용한 기존 통장의 9월 말 잔고로 과거 월을 역산합니다.
		jdbc.update("update bank_accounts set valid_from=date '2026-07-01' where property_id=?", property);
		UUID first = UUID.randomUUID(), second = UUID.randomUUID();
		for (var pair : List.of(Map.entry(first, "102동"), Map.entry(second, "103동")))
			jdbc.update(
			    "insert into buildings(id,property_id,name,sort_order,status,created_at,updated_at) values (?,?,?,0,'ACTIVE',now(),now())",
			    pair.getKey(), property, pair.getValue());
		jdbc.update("update units set building_id=? where id=?", first, unit);
		var setup = new com.moahome.server.banking.dto.BankingBalanceRequests.Opening(LocalDate.of(2026, 9, 30),
		    List.of(new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(first, "600000"),
		        new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(second, "300000")));
		cashBalances.saveOpenings(user, property, setup);
		cashBalances.saveOpenings(user, property, setup);
		assertThat(count("building_cash_openings")).isEqualTo(2);
		var file = csv(
		    "거래일시,적요,출금액,입금액,잔액\n2026-10-15 08:00:00,김대표,0,50000,950000\n2026-10-15 09:00:00,07전기요금,182660,0,767340");
		var preview = banking.preview(user, property, file);
		var power = new com.moahome.server.banking.dto.BankingRequests.Expense("전기료", null, "RATIO", false,
		    List.of(new com.moahome.server.banking.dto.BankingRequests.Allocation(first, null, null, "25"),
		        new com.moahome.server.banking.dto.BankingRequests.Allocation(second, null, null, "25"),
		        new com.moahome.server.banking.dto.BankingRequests.Allocation(null, "외부 101동", null, "50")));
		banking.upload(user, property, file,
		    new com.moahome.server.banking.dto.BankingRequests.Import(
		        preview.rows().stream().map(r -> new com.moahome.server.banking.dto.BankingRequests.Selection(r.id(),
		            null, null, null, r.direction().equals("EXPENSE") ? power : null)).toList()));
		jdbc.update("update units set building_id=? where id=?", second, unit);
		var before = cashBalances.workspace(user, property, "2026-10");
		assertThat(before.buildings().stream().filter(b -> b.id().equals(first)).findFirst().orElseThrow().balance())
		    .isEqualTo("604335");
		assertThat(before.buildings().stream().filter(b -> b.id().equals(second)).findFirst().orElseThrow().balance())
		    .isEqualTo("254335");
		assertThat(before.bankBalance()).isEqualTo("767340");
		assertThat(before.externals()).singleElement().satisfies(e -> assertThat(e.remaining()).isEqualTo("91330"));
		// 기준일 당일 지출은 기준 잔고에 포함됩니다. 이전 월은 이 거래를 되돌리고 미래 은행 잔고를 가져오지 않습니다.
		var earlierFile = csv("거래일시,적요,출금액,입금액,잔액\n2026-09-30 10:00:00,청소,10000,0,900000");
		var earlierPreview = banking.preview(user, property, earlierFile);
		var earlierExpense = new com.moahome.server.banking.dto.BankingRequests.Expense("청소", null, "EQUAL", false,
		    List.of(new com.moahome.server.banking.dto.BankingRequests.Allocation(first, null, null, null)));
		banking.upload(user, property, earlierFile,
		    new com.moahome.server.banking.dto.BankingRequests.Import(earlierPreview.rows().stream()
		        .map(r -> new com.moahome.server.banking.dto.BankingRequests.Selection(r.id(), null, null, null,
		            earlierExpense))
		        .toList()));
		var september = cashBalances.workspace(user, property, "2026-09");
		var septemberFirst = september.buildings().stream().filter(b -> b.id().equals(first)).findFirst().orElseThrow();
		assertThat(septemberFirst.startBalance()).isEqualTo("610000");
		assertThat(septemberFirst.balance()).isEqualTo("600000");
		assertThat(septemberFirst.expense()).isEqualTo("10000");
		assertThat(september.entries()).hasSize(1);
		assertThat(september.bankBalance()).isEqualTo("900000");
		var august = cashBalances.workspace(user, property, "2026-08");
		assertThat(august.buildings().stream().filter(b -> b.id().equals(first)).findFirst().orElseThrow().balance())
		    .isEqualTo("610000");
		assertThat(august.bankBalance()).isNull();
		assertThat(august.entries()).isEmpty();
		// 이미 기록된 귀속 동은 세대가 이동해도 유지하며 확인 목록에 다시 나타나지 않습니다.
		var household = jdbc.queryForObject(
		    "select id from payments where property_id=? and receipt_type='HOUSEHOLD' and cash_building_id is not null limit 1",
		    UUID.class, property);
		assertThat(jdbc.queryForObject("select cash_building_id from payments where id=?", UUID.class, household))
		    .isEqualTo(first);
		assertThat(cashBalances.workspace(user, property, "2026-10").incomes())
		    .noneMatch(i -> i.id().equals(household));
		var repayment = csv("거래일시,적요,출금액,입금액,잔액\n2026-10-15 10:00:00,외부 전기료 반환,0,40000,807340");
		var imported = service.importFile(user, property, repayment).payments().stream()
		    .filter(p -> p.payer().equals("외부 전기료 반환")).findFirst().orElseThrow();
		service.confirmOtherIncome(user, property, imported.id(), new PaymentRequests.OtherIncome("외부 부담금", null));
		UUID external = before.externals().getFirst().id(), linkId = UUID.randomUUID();
		var link = new com.moahome.server.banking.dto.BankingBalanceRequests.Settlement(linkId, external, imported.id(),
		    "30000");
		// 입금 연결 없이도 외부 지급 건을 정산에서 제외하고 복원합니다. 통장·부담액·회수 이력은 바꾸지 않습니다.
		var exclude = new com.moahome.server.banking.dto.BankingBalanceRequests.SettlementDecision(UUID.randomUUID(),
		    external, true, 0L);
		List<Map<String, Object>> originalBank = jdbc.queryForList("select * from bank_transactions order by id");
		List<Map<String, Object>> originalParts = jdbc.queryForList("select * from expense_allocations order by id");
		cashBalances.decideSettlement(user, property, exclude);
		cashBalances.decideSettlement(user, property, exclude);
		assertThat(count("external_settlement_decisions")).isEqualTo(1);
		var excluded = cashBalances.workspace(user, property, "2026-10");
		assertThat(excluded.externals()).singleElement().satisfies(e -> {
			assertThat(e.excluded()).isTrue();
			assertThat(e.decisionRevision()).isEqualTo(1);
			assertThat(e.remaining()).isEqualTo("91330");
		});
		assertThat(excluded.buildings()).isEqualTo(before.buildings());
		assertThatThrownBy(() -> cashBalances.settle(user, property, link)).isInstanceOf(PaymentException.class)
		    .hasMessage("EXTERNAL_SETTLEMENT_EXCLUDED");
		assertThatThrownBy(() -> jdbc.update(
		    "insert into external_settlement_links(id,property_id,allocation_id,payment_id,amount,created_by,created_at) values (?,?,?,?,1,?,now())",
		    UUID.randomUUID(), property, external, imported.id(), user))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
		assertThatThrownBy(
		    () -> cashBalances.decideSettlement(user, property,
		        new com.moahome.server.banking.dto.BankingBalanceRequests.SettlementDecision(UUID.randomUUID(),
		            external, false, 0L)))
		    .isInstanceOf(PaymentException.class).hasMessage("EXTERNAL_SETTLEMENT_DECISION_CONFLICT");
		cashBalances.decideSettlement(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.SettlementDecision(UUID.randomUUID(), external,
		        false, 1L));
		cashBalances.decideSettlement(user, property, exclude);
		assertThat(cashBalances.workspace(user, property, "2026-10").externals().getFirst().excluded()).isFalse();
		assertThat(jdbc.queryForList("select * from bank_transactions order by id")).isEqualTo(originalBank);
		assertThat(jdbc.queryForList("select * from expense_allocations order by id")).isEqualTo(originalParts);
		assertThatThrownBy(
		    () -> jdbc.update("update external_settlement_decisions set excluded=false where id=?", exclude.id()))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
		assertThatThrownBy(() -> cashBalances.decideSettlement(user, UUID.randomUUID(), exclude))
		    .isInstanceOf(AuthException.class);
		cashBalances.settle(user, property, link);
		cashBalances.settle(user, property, link);
		assertThat(count("external_settlement_links")).isEqualTo(1);
		assertThat(cashBalances.workspace(user, property, "2026-10").externals().getFirst().remaining())
		    .isEqualTo("61330");
		cashBalances.decideSettlement(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.SettlementDecision(UUID.randomUUID(), external,
		        true, 2L));
		var partiallyRecovered = cashBalances.workspace(user, property, "2026-10").externals().getFirst();
		assertThat(partiallyRecovered.excluded()).isTrue();
		assertThat(partiallyRecovered.received()).isEqualTo("30000");
		assertThat(partiallyRecovered.recoveries()).hasSize(1);
		cashBalances.decideSettlement(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.SettlementDecision(UUID.randomUUID(), external,
		        false, 3L));

		assertThatThrownBy(() -> cashBalances.settle(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.Settlement(UUID.randomUUID(), external,
		        imported.id(), "15000")))
		    .isInstanceOf(PaymentException.class);
		cashBalances.settle(user, property, new com.moahome.server.banking.dto.BankingBalanceRequests.Settlement(
		    UUID.randomUUID(), external, imported.id(), "10000"));
		assertThat(cashBalances.workspace(user, property, "2026-10").externals().getFirst().remaining())
		    .isEqualTo("51330");
		assertThatThrownBy(() -> jdbc.update(
		    "insert into external_settlement_links(id,property_id,allocation_id,payment_id,amount,created_by,created_at) values (?,?,?,?,1,?,now())",
		    UUID.randomUUID(), property, external, imported.id(), user))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
		assertThatThrownBy(() -> jdbc.update("update building_cash_openings set amount=0 where building_id=?", first))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
		service.cancel(user, property, imported.id(), "입금 분류 확인");
		assertThat(cashBalances.workspace(user, property, "2026-10").externals().getFirst().remaining())
		    .isEqualTo("91330");
		assertThat(count("external_settlement_links")).isEqualTo(2);
		assertThatThrownBy(
		    () -> cashBalances.workspace(users.saveAndFlush(User.create("다른 관리자", null)).getId(), property, "2026-10"))
		    .isInstanceOf(AuthException.class);
	}

	/** 기준일을 과거로 정정하면 새 마감 잔고에서 다시 계산하되 원본·이력과 재시도 결과를 보존합니다. */
	@Test
	void correctsCashOpeningDateAndAllBuildingAmountsWithHistoryAndStaleWriteProtection() {
		UUID first = UUID.randomUUID(), second = UUID.randomUUID();
		for (var pair : List.of(Map.entry(first, "102동"), Map.entry(second, "103동")))
			jdbc.update(
			    "insert into buildings(id,property_id,name,sort_order,status,created_at,updated_at) values (?,?,?,0,'ACTIVE',now(),now())",
			    pair.getKey(), property, pair.getValue());
		jdbc.update("update units set building_id=? where id=?", first, unit);
		jdbc.update("update properties set balance_cutoff_date=date '2026-09-30' where id=?", property);
		cashBalances.saveOpenings(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.Opening(LocalDate.of(2026, 10, 1),
		        List.of(new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(first, "600000"),
		            new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(second, "300000"))));
		var file = csv(
		    "거래일시,적요,출금액,입금액,잔액\n2026-10-15 08:00:00,김대표,0,50000,950000\n2026-10-15 09:00:00,청소,20000,0,930000");
		var preview = banking.preview(user, property, file);
		var cleaning = new com.moahome.server.banking.dto.BankingRequests.Expense("청소", null, "EQUAL", false,
		    List.of(new com.moahome.server.banking.dto.BankingRequests.Allocation(first, null, null, null)));
		banking.upload(user, property, file,
		    new com.moahome.server.banking.dto.BankingRequests.Import(preview.rows().stream()
		        .map(r -> new com.moahome.server.banking.dto.BankingRequests.Selection(r.id(),
		            r.direction().equals("INCOME") ? unit : null, null, null,
		            r.direction().equals("EXPENSE") ? cleaning : null))
		        .toList()));
		List<Map<String, Object>> originalBank = jdbc.queryForList("select * from bank_transactions order by id");
		List<Map<String, Object>> originalPayments = jdbc.queryForList("select * from payments order by id");
		List<BankingBalanceRequests.OpeningCorrectionPart> parts = List.of(
		    new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningCorrectionPart(first, "500000", 0L),
		    new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningCorrectionPart(second, "250000", 0L));
		var request = new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningCorrection(UUID.randomUUID(),
		    LocalDate.of(2026, 6, 30), parts);
		cashBalances.correctOpenings(user, property, request);
		cashBalances.correctOpenings(user, property, request);
		assertThat(count("building_cash_opening_changes")).isEqualTo(2);
		var corrected = cashBalances.workspace(user, property, "2026-10");
		assertThat(corrected.cutoffDate()).isEqualTo(LocalDate.of(2026, 6, 30));
		assertThat(corrected.buildings().stream().filter(b -> b.id().equals(first)).findFirst().orElseThrow())
		    .satisfies(b -> {
			    assertThat(b.openingBalance()).isEqualTo("500000");
			    assertThat(b.openingRevision()).isEqualTo(1);
			    assertThat(b.balance()).isEqualTo("530000");
		    });
		// 기준일 정정은 등록일·실제 입출금보다 앞선 월에 통장을 노출하는 사용 이력이 아닙니다.
		assertThat(cashBalances.workspace(user, property, "2026-09").buildings()).isEmpty();
		assertThat(jdbc.queryForList("select * from bank_transactions order by id")).isEqualTo(originalBank);
		assertThat(jdbc.queryForList("select * from payments order by id")).isEqualTo(originalPayments);
		assertThatThrownBy(
		    () -> cashBalances.correctOpenings(user, property,
		        new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningCorrection(UUID.randomUUID(),
		            request.cutoffDate(), parts)))
		    .isInstanceOf(PaymentException.class).hasMessage("CASH_OPENING_CONFLICT");
		assertThatThrownBy(() -> cashBalances.correctOpenings(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningCorrection(UUID.randomUUID(),
		        request.cutoffDate(), List.of(parts.getFirst()))))
		    .isInstanceOf(PaymentException.class).hasMessage("INVALID_CASH_OPENING");
		List<BankingBalanceRequests.OpeningCorrectionPart> next = List.of(
		    new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningCorrectionPart(first, "510000", 1L),
		    new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningCorrectionPart(second, "260000", 1L));
		assertThatThrownBy(() -> cashBalances.correctOpenings(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningCorrection(UUID.randomUUID(),
		        LocalDate.of(2026, 10, 16), next)))
		    .isInstanceOf(PaymentException.class).hasMessage("INVALID_CASH_OPENING_DATE");
		cashBalances.correctOpenings(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningCorrection(UUID.randomUUID(),
		        request.cutoffDate(), next));
		cashBalances.correctOpenings(user, property, request);
		assertThat(cashBalances.workspace(user, property, "2026-10").buildings().stream()
		    .filter(b -> b.id().equals(first)).findFirst().orElseThrow().openingBalance()).isEqualTo("510000");
		assertThat(count("building_cash_opening_changes")).isEqualTo(4);
		assertThat(jdbc.queryForObject(
		    "select previous_cutoff_date from building_cash_opening_changes where building_id=? and previous_revision=0",
		    LocalDate.class, first)).isEqualTo(LocalDate.of(2026, 10, 1));
		assertThatThrownBy(() -> jdbc.update("update building_cash_openings set amount=0 where building_id=?", first))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
		assertThatThrownBy(() -> jdbc.update("delete from building_cash_opening_changes where building_id=?", first))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
	}

	/** 과거 세대 연결 입금은 자동으로 동에 넣고 기존 스냅샷·기타 입금·은행 원본은 그대로 보존합니다. */
	@Test
	void linkedHistoricalIncomeAutomaticallyKeepsItsFirstBuildingAfterMigrationAndLaterUpdates() {
		UUID first = UUID.randomUUID(), second = UUID.randomUUID();
		for (var pair : List.of(Map.entry(first, "102동"), Map.entry(second, "103동")))
			jdbc.update(
			    "insert into buildings(id,property_id,name,sort_order,status,created_at,updated_at) values (?,?,?,0,'ACTIVE',now(),now())",
			    pair.getKey(), property, pair.getValue());
		jdbc.update("update units set building_id=? where id=?", first, unit);
		var file = csv("거래일시,적요,출금액,입금액,잔액\n2026-10-15 08:00:00,김대표,0,50000,950000");
		var preview = banking.preview(user, property, file);
		banking.upload(user, property, file,
		    new com.moahome.server.banking.dto.BankingRequests.Import(preview.rows().stream()
		        .map(r -> new com.moahome.server.banking.dto.BankingRequests.Selection(r.id(), unit, null, null, null))
		        .toList()));
		var payment = jdbc.queryForObject(
		    "select id from payments where property_id=? and receipt_type='HOUSEHOLD' limit 1", UUID.class, property);
		String schema = "automatic_cash_" + UUID.randomUUID().toString().replace("-", "");
		var previous = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
		    .schemas(schema).defaultSchema(schema).target("20261017105017").load();
		previous.migrate();
		for (String table : List.of("users", "properties", "buildings", "units", "bank_accounts", "residents",
		    "bank_transactions", "payments"))
			copyPreviousTable(schema, table);
		jdbc.execute("alter table " + schema + ".payments disable trigger payments_cash_building_check");
		jdbc.update("update " + schema + ".payments set cash_building_id=null where id=?", payment);
		jdbc.execute("alter table " + schema + ".payments enable trigger payments_cash_building_check");
		List<Map<String, Object>> originalBank = jdbc
		    .queryForList("select * from " + schema + ".bank_transactions order by id");
		originalBank.forEach(row -> row.put("transfer_candidate", false));
		var upgraded = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
		    .schemas(schema).defaultSchema(schema).load();
		upgraded.migrate();
		upgraded.validate();
		assertThat(
		    jdbc.queryForObject("select cash_building_id from " + schema + ".payments where id=?", UUID.class, payment))
		    .isEqualTo(first);
		// 빈 동 스냅샷의 이후 이관도 DB가 채우고 세대 이동 뒤에는 기록한 동을 덮어쓰지 않습니다.
		jdbc.execute("alter table " + schema + ".payments disable trigger payments_cash_building_check");
		jdbc.update("update " + schema + ".payments set cash_building_id=null where id=?", payment);
		jdbc.execute("alter table " + schema + ".payments enable trigger payments_cash_building_check");
		assertThat(
		    jdbc.queryForObject("select cash_building_id from " + schema + ".payments where id=?", UUID.class, payment))
		    .isEqualTo(first);
		jdbc.update("update " + schema + ".units set building_id=? where id=?", second, unit);
		jdbc.update("update " + schema + ".payments set updated_at=updated_at where id=?", payment);
		assertThat(
		    jdbc.queryForObject("select cash_building_id from " + schema + ".payments where id=?", UUID.class, payment))
		    .isEqualTo(first);
		assertThat(jdbc.queryForList("select * from " + schema + ".bank_transactions order by id"))
		    .isEqualTo(originalBank);
		jdbc.execute("drop schema " + schema + " cascade");
	}

	/** 실제 적용된 통장 Migration의 체크섬을 고정하고 보호 제약은 후속 파일로만 확장합니다. */
	@Test
	void appliedBankingMigrationKeepsChecksumAndUpgradesWithoutChangingTransactions() {
		service.importFile(user, property, bank("원본보존", "50000"));
		String schema = "banking_protection_" + UUID.randomUUID().toString().replace("-", "");
		var previous = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
		    .schemas(schema).defaultSchema(schema).target("20261017074932").load();
		previous.migrate();
		assertThat(previous.info().current().getChecksum()).isEqualTo(-1029174370);
		for (String table : List.of("users", "properties", "buildings", "units", "bank_accounts", "residents",
		    "bank_transactions", "payments"))
			copyPreviousTable(schema, table);
		List<Map<String, Object>> originals = jdbc
		    .queryForList("select * from " + schema + ".bank_transactions order by id");
		originals.forEach(row -> row.put("transfer_candidate", false));
		List<Map<String, Object>> receipts = jdbc.queryForList("select * from " + schema + ".payments order by id");
		var upgraded = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
		    .schemas(schema).defaultSchema(schema).load();
		int pending = upgraded.info().pending().length;
		assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(pending);
		upgraded.validate();
		assertThat(jdbc.queryForObject(
		    "select checksum from " + schema + ".flyway_schema_history where version='20261017074932'", Integer.class))
		    .isEqualTo(-1029174370);
		assertThat(jdbc.queryForList("select * from " + schema + ".bank_transactions order by id"))
		    .isEqualTo(originals);
		receipts.forEach(row -> {
			row.put("auto_match_eligible", true);
			row.put("cash_building_id", null);
			row.put("manual_purpose", "MANUAL".equals(row.get("source_type")) ? "HOUSEHOLD" : null);
		});
		assertThat(jdbc.queryForList("select * from " + schema + ".payments order by id")).isEqualTo(receipts);
		assertThat(jdbc.queryForObject(
		    "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace "
		        + "where n.nspname=? and t.tgname in ('expenses_immutable','expense_allocations_immutable','expense_bank_source_check')",
		    Integer.class, schema)).isEqualTo(3);
		jdbc.execute("drop schema " + schema + " cascade");
	}

	@Test
	void numericOnlyBankDescriptionRemainsReadableInBankingWorkspace() {
		service.importFile(user, property, bank("07", "50000"));
		assertThat(banking.workspace(user, property).rows()).singleElement()
		    .satisfies(r -> assertThat(r.payer()).isEqualTo("07"));
	}

	@Test
	void invalidExpenseRollsBackBothDirectionsAndRejectsOtherPropertyTarget() {
		var file = csv("거래일시,적요,출금액,입금액\n2026-10-15 08:00:00,김대표,0,50000\n2026-10-15 09:00:00,전기요금,182660,0");
		var preview = banking.preview(user, property, file);
		var expense = new com.moahome.server.banking.dto.BankingRequests.Expense("전기료", null, "RATIO", false,
		    List.of(new com.moahome.server.banking.dto.BankingRequests.Allocation(null, "102동", null, "25"),
		        new com.moahome.server.banking.dto.BankingRequests.Allocation(null, "103동", null, "25")));
		var selected = new com.moahome.server.banking.dto.BankingRequests.Import(List.of(
		    new com.moahome.server.banking.dto.BankingRequests.Selection(preview.rows().get(0).id(), null, null, null,
		        null),
		    new com.moahome.server.banking.dto.BankingRequests.Selection(preview.rows().get(1).id(), null, null, null,
		        expense)));
		assertThatThrownBy(() -> banking.upload(user, property, file, selected)).isInstanceOf(PaymentException.class);
		assertThat(count("bank_transactions")).isZero();
		assertThat(count("payments")).isZero();
		assertThat(count("expenses")).isZero();
		var foreignExpense = new com.moahome.server.banking.dto.BankingRequests.Expense("전기료", null, "EQUAL", false,
		    List.of(
		        new com.moahome.server.banking.dto.BankingRequests.Allocation(UUID.randomUUID(), null, null, null)));
		assertThatThrownBy(() -> banking.upload(user, property, file,
		    new com.moahome.server.banking.dto.BankingRequests.Import(
		        List.of(new com.moahome.server.banking.dto.BankingRequests.Selection(preview.rows().get(1).id(), null,
		            null, null, foreignExpense)))))
		    .isInstanceOfSatisfying(PaymentException.class,
		        e -> assertThat(e.code()).isEqualTo("INVALID_EXPENSE_TARGET"));
		assertThat(count("bank_transactions")).isZero();
	}

	@Test
	void samePartyRefundDirectionsRemainDistinctAndOtherIncomeOverridesNameMatch() {
		var file = csv(
		    "거래일시,적요,출금액,입금액,잔액\n2026-10-15 09:00:00,환불거래,30000,0,100000\n2026-10-15 09:00:35,환불거래,0,30000,130000\n2026-10-15 10:00:00,김대표,0,60000,190000");
		var preview = banking.preview(user, property, file);
		var selected = new com.moahome.server.banking.dto.BankingRequests.Import(
		    preview.rows().stream().map(r -> new com.moahome.server.banking.dto.BankingRequests.Selection(r.id(), null,
		        "김대표".equals(r.payer()) ? "수리비" : null, null, null)).toList());
		var saved = banking.upload(user, property, file, selected);
		assertThat(saved.rows()).hasSize(3);
		assertThat(saved.rows()).filteredOn(r -> "EXPENSE".equals(r.direction())).hasSize(1);
		assertThat(service.workspace(user, property).payments()).filteredOn(p -> "김대표".equals(p.payer()))
		    .allSatisfy(p -> {
			    assertThat(p.receiptType()).isEqualTo("OTHER");
			    assertThat(p.allocations()).isEmpty();
			    assertThat(p.unitId()).isEmpty();
		    });
		assertThat(banking.preview(user, property, file).duplicateCount()).isEqualTo(3);
		assertThatThrownBy(() -> banking.workspace(users.saveAndFlush(User.create("다른관리자", null)).getId(), property))
		    .isInstanceOf(AuthException.class);
	}

	@Test
	void distributesInterestIncomeWithoutDuplicatingBankOrHouseholdCashAndCanDeleteReimport() {
		UUID first = UUID.randomUUID(), second = UUID.randomUUID();
		for (var pair : List.of(Map.entry(first, "102동"), Map.entry(second, "103동")))
			jdbc.update(
			    "insert into buildings(id,property_id,name,sort_order,status,created_at,updated_at) values (?,?,?,0,'ACTIVE',now(),now())",
			    pair.getKey(), property, pair.getValue());
		cashBalances.saveOpenings(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.Opening(LocalDate.of(2026, 9, 30),
		        List.of(new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(first, "10000"),
		            new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(second, "20000"))));
		var file = csv("거래일시,적요,출금액,입금액,잔액\n2026-10-15 08:00:00,예금이자,0,1000,31000");
		var preview = banking.preview(user, property, file);
		var split = new com.moahome.server.banking.dto.BankingRequests.Expense("예금이자", null, "EQUAL", false,
		    List.of(new com.moahome.server.banking.dto.BankingRequests.Allocation(first, null, null, null),
		        new com.moahome.server.banking.dto.BankingRequests.Allocation(second, null, null, null)));
		var input = new com.moahome.server.banking.dto.BankingRequests.Import(
		    List.of(new com.moahome.server.banking.dto.BankingRequests.Selection(preview.rows().getFirst().id(), null,
		        "예금이자", null, null, split)));
		var saved = banking.upload(user, property, file, input);
		var original = saved.rows().getFirst();
		assertThat(original.receiptType()).isEqualTo("OTHER");
		assertThat(original.incomeAllocation().allocations()).extracting(a -> a.amount()).containsExactly("500", "500");
		banking.confirmIncomeAllocation(user, property, original.id(), split);
		assertThat(count("bank_transactions")).isEqualTo(1);
		assertThat(count("payments")).isEqualTo(1);
		assertThat(count("income_allocations")).isEqualTo(2);
		var cash = cashBalances.workspace(user, property, "2026-10");
		assertThat(cash.buildings()).extracting(b -> b.income()).containsOnly("500");
		assertThat(cash.buildings()).extracting(b -> b.balance()).containsExactlyInAnyOrder("10500", "20500");
		assertThat(cash.entries()).hasSize(2);
		assertThat(cash.incomes()).isEmpty();
		assertThat(service.workspace(user, property).payments().getFirst().allocations()).isEmpty();
		assertThatThrownBy(
		    () -> jdbc.update("update income_allocations set amount=1 where payment_id=?", original.paymentId()))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
		var changed = new com.moahome.server.banking.dto.BankingRequests.Expense("예금이자", null, "RATIO", false,
		    List.of(new com.moahome.server.banking.dto.BankingRequests.Allocation(first, null, null, "25"),
		        new com.moahome.server.banking.dto.BankingRequests.Allocation(second, null, null, "75")));
		assertThatThrownBy(() -> banking.confirmIncomeAllocation(user, property, original.id(), changed))
		    .isInstanceOf(PaymentException.class);
		banking.deleteMany(user, property,
		    new com.moahome.server.banking.dto.BankingRequests.DeleteMany(List.of(original.id())));
		assertThat(cashBalances.workspace(user, property, "2026-10").buildings()).extracting(b -> b.income())
		    .containsOnly("0");
		assertThat(cashBalances.workspace(user, property, "2026-10").entries()).isEmpty();
		assertThat(count("income_allocations")).isEqualTo(2);
		var ratioInput = new com.moahome.server.banking.dto.BankingRequests.Import(
		    List.of(new com.moahome.server.banking.dto.BankingRequests.Selection(preview.rows().getFirst().id(), null,
		        "예금이자", null, null, changed)));
		var again = banking.upload(user, property, file, ratioInput).rows().getFirst();
		assertThat(again.id()).isNotEqualTo(original.id());
		assertThat(cashBalances.workspace(user, property, "2026-10").buildings()).extracting(b -> b.income())
		    .containsExactlyInAnyOrder("250", "750");
		service.cancel(user, property, again.paymentId(), "분배 정정");
		assertThat(cashBalances.workspace(user, property, "2026-10").buildings()).extracting(b -> b.income())
		    .containsOnly("0");
		assertThat(count("income_allocations")).isEqualTo(4);
	}

	/** 외부 정산에서 원본을 삭제할 때 다른 동의 지출도 함께 빠지고 확정 배분 이력은 보존되는지 검증합니다. */
	@Test
	void deletingExternalSourceRemovesAllBuildingCostsAndPreservesExpenseHistory() {
		UUID first = UUID.randomUUID(), second = UUID.randomUUID();
		for (var pair : List.of(Map.entry(first, "102동"), Map.entry(second, "103동")))
			jdbc.update(
			    "insert into buildings(id,property_id,name,sort_order,status,created_at,updated_at) values (?,?,?,0,'ACTIVE',now(),now())",
			    pair.getKey(), property, pair.getValue());
		cashBalances.saveOpenings(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.Opening(LocalDate.of(2026, 9, 30),
		        List.of(new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(first, "500000"),
		            new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(second, "500000"))));
		var file = csv("거래일시,적요,출금액,입금액\n2026-10-12 10:00:00,전기료,182690,0");
		var preview = banking.preview(user, property, file);
		var expense = new com.moahome.server.banking.dto.BankingRequests.Expense("전기료", null, "AMOUNT", false,
		    List.of(new com.moahome.server.banking.dto.BankingRequests.Allocation(first, null, "45672", null),
		        new com.moahome.server.banking.dto.BankingRequests.Allocation(second, null, "45673", null),
		        new com.moahome.server.banking.dto.BankingRequests.Allocation(null, "외부 101동", "91345", null)));
		var saved = banking.upload(user, property, file,
		    new com.moahome.server.banking.dto.BankingRequests.Import(
		        List.of(new com.moahome.server.banking.dto.BankingRequests.Selection(preview.rows().getFirst().id(),
		            null, null, null, expense))));
		var before = cashBalances.workspace(user, property, "2026-10");
		var external = before.externals().getFirst();
		assertThat(external.transactionId()).isEqualTo(saved.rows().getFirst().id());
		assertThat(external.transactionAmount()).isEqualTo("182690");
		assertThat(external.amount()).isEqualTo("91345");
		assertThat(before.buildings()).extracting(b -> b.expense()).containsExactlyInAnyOrder("45672", "45673");
		var request = new com.moahome.server.banking.dto.BankingRequests.DeleteMany(List.of(external.transactionId()));
		banking.deleteMany(user, property, request);
		banking.deleteMany(user, property, request);
		var after = cashBalances.workspace(user, property, "2026-10");
		assertThat(after.externals()).isEmpty();
		assertThat(after.entries()).isEmpty();
		assertThat(after.buildings()).extracting(b -> b.expense()).containsOnly("0");
		assertThat(after.buildings()).extracting(b -> b.balance()).containsOnly("500000");
		assertThat(banking.workspace(user, property).rows()).isEmpty();
		assertThat(count("expenses")).isEqualTo(1);
		assertThat(count("expense_allocations")).isEqualTo(3);
	}

	@Test
	void interestAllocationAndExternalRecoveryCannotUseTheSameReceiptAndDeletedExpenseReleasesRecovery() {
		UUID first = UUID.randomUUID(), second = UUID.randomUUID();
		for (var pair : List.of(Map.entry(first, "102동"), Map.entry(second, "103동")))
			jdbc.update(
			    "insert into buildings(id,property_id,name,sort_order,status,created_at,updated_at) values (?,?,?,0,'ACTIVE',now(),now())",
			    pair.getKey(), property, pair.getValue());
		cashBalances.saveOpenings(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.Opening(LocalDate.of(2026, 9, 30),
		        List.of(new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(first, "0"),
		            new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(second, "0"))));
		var file = csv(
		    "거래일시,적요,출금액,입금액\n2026-10-15 08:00:00,이자,0,1000\n2026-10-15 09:00:00,외부회수,0,500\n2026-10-15 10:00:00,전기료,1000,0");
		var preview = banking.preview(user, property, file);
		var external = new com.moahome.server.banking.dto.BankingRequests.Expense("전기료", null, "EQUAL", false,
		    List.of(new com.moahome.server.banking.dto.BankingRequests.Allocation(null, "외부 101동", null, null)));
		var saved = banking.upload(user, property, file,
		    new com.moahome.server.banking.dto.BankingRequests.Import(preview.rows().stream()
		        .map(r -> new com.moahome.server.banking.dto.BankingRequests.Selection(r.id(), null,
		            "INCOME".equals(r.direction()) ? r.payer() : null, null,
		            "EXPENSE".equals(r.direction()) ? external : null))
		        .toList()));
		var interest = saved.rows().stream().filter(r -> r.payer().equals("이자")).findFirst().orElseThrow();
		var recovery = saved.rows().stream().filter(r -> r.payer().equals("외부회수")).findFirst().orElseThrow();
		var power = saved.rows().stream().filter(r -> r.payer().equals("전기료")).findFirst().orElseThrow();
		List<BankingRequests.Allocation> shares = List.of(
		    new com.moahome.server.banking.dto.BankingRequests.Allocation(first, null, null, null),
		    new com.moahome.server.banking.dto.BankingRequests.Allocation(second, null, null, null));
		banking.confirmIncomeAllocation(user, property, interest.id(),
		    new com.moahome.server.banking.dto.BankingRequests.Expense("이자", null, "EQUAL", false, shares));
		var target = cashBalances.workspace(user, property, "2026-10").externals().getFirst().id();
		assertThatThrownBy(() -> cashBalances.settle(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.Settlement(UUID.randomUUID(), target,
		        interest.paymentId(), "100")))
		    .isInstanceOf(PaymentException.class);
		assertThatThrownBy(() -> jdbc.update(
		    "insert into external_settlement_links(id,property_id,allocation_id,payment_id,amount,created_by,created_at) values (?,?,?,?,100,?,now())",
		    UUID.randomUUID(), property, target, interest.paymentId(), user))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
		cashBalances.settle(user, property, new com.moahome.server.banking.dto.BankingBalanceRequests.Settlement(
		    UUID.randomUUID(), target, recovery.paymentId(), "100"));
		assertThatThrownBy(() -> banking.confirmIncomeAllocation(user, property, recovery.id(),
		    new com.moahome.server.banking.dto.BankingRequests.Expense("외부회수", null, "EQUAL", false, shares)))
		    .isInstanceOfSatisfying(PaymentException.class,
		        e -> assertThat(e.code()).isEqualTo("INCOME_ALREADY_SETTLED"));
		assertThat(cashBalances.workspace(user, property, "2026-10").incomes()).singleElement()
		    .satisfies(r -> assertThat(r.available()).isEqualTo("400"));
		banking.deleteMany(user, property,
		    new com.moahome.server.banking.dto.BankingRequests.DeleteMany(List.of(power.id())));
		var after = cashBalances.workspace(user, property, "2026-10");
		assertThat(after.externals()).isEmpty();
		assertThat(after.incomes()).singleElement().satisfies(r -> assertThat(r.available()).isEqualTo("500"));
		assertThat(after.buildings()).extracting(b -> b.income()).containsOnly("500");
		assertThat(count("external_settlement_links")).isEqualTo(1);
	}

	@Test
	void interestAllocationRejectsFractionalSumsForeignTargetsAndNonOtherReceiptsAtomically() {
		UUID first = UUID.randomUUID(), second = UUID.randomUUID();
		for (var pair : List.of(Map.entry(first, "102동"), Map.entry(second, "103동")))
			jdbc.update(
			    "insert into buildings(id,property_id,name,sort_order,status,created_at,updated_at) values (?,?,?,0,'ACTIVE',now(),now())",
			    pair.getKey(), property, pair.getValue());
		var file = csv("거래일시,적요,출금액,입금액\n2026-10-15 08:00:00,예금이자,0,1001");
		var preview = banking.preview(user, property, file);
		var split = new com.moahome.server.banking.dto.BankingRequests.Expense("이자", null, "EQUAL", false,
		    List.of(new com.moahome.server.banking.dto.BankingRequests.Allocation(first, null, null, null),
		        new com.moahome.server.banking.dto.BankingRequests.Allocation(second, null, null, null)));
		assertThatThrownBy(() -> banking.upload(user, property, file,
		    new com.moahome.server.banking.dto.BankingRequests.Import(
		        List.of(new com.moahome.server.banking.dto.BankingRequests.Selection(preview.rows().getFirst().id(),
		            null, "이자", null, null, split)))))
		    .isInstanceOfSatisfying(PaymentException.class,
		        e -> assertThat(e.code()).isEqualTo("ALLOCATION_REMAINDER_REQUIRED"));
		assertThat(count("bank_transactions")).isZero();
		assertThat(count("payments")).isZero();
		var saved = service.importFile(user, property, bank("김대표", "50000")).payments().getFirst();
		assertThatThrownBy(() -> banking.confirmIncomeAllocation(user, property, saved.bankTransactionId(), split))
		    .isInstanceOfSatisfying(PaymentException.class,
		        e -> assertThat(e.code()).isEqualTo("OTHER_INCOME_REQUIRED"));
	}

	@Test
	void deleteBankTransactionsCancelsReceiptsPreservesExpenseHistoryAndAllowsReimport() {
		var file = csv(
		    "거래일시,적요,출금액,입금액,잔액\n2026-10-15 08:00:00,김대표,0,50000,50000\n2026-10-15 09:00:00,청소,20000,0,30000");
		var preview = banking.preview(user, property, file);
		var expense = new com.moahome.server.banking.dto.BankingRequests.Expense("청소", null, "EQUAL", false,
		    List.of(new com.moahome.server.banking.dto.BankingRequests.Allocation(null, "외부", null, null)));
		var selection = new com.moahome.server.banking.dto.BankingRequests.Import(
		    preview.rows().stream().map(r -> new com.moahome.server.banking.dto.BankingRequests.Selection(r.id(), null,
		        null, null, "EXPENSE".equals(r.direction()) ? expense : null)).toList());
		var saved = banking.upload(user, property, file, selection);
		List<UUID> ids = saved.rows().stream().map(r -> r.id()).toList();
		var remove = new com.moahome.server.banking.dto.BankingRequests.DeleteMany(ids);
		assertThatThrownBy(() -> banking.deleteMany(user, property,
		    new com.moahome.server.banking.dto.BankingRequests.DeleteMany(List.of(ids.getFirst(), UUID.randomUUID()))))
		    .isInstanceOf(PaymentException.class);
		assertThat(banking.workspace(user, property).rows()).hasSize(2);
		assertThat(banking.deleteMany(user, property, remove).rows()).isEmpty();
		assertThat(service.workspace(user, property).payments()).isEmpty();
		assertThat(jdbc.queryForObject("select count(*) from payment_allocations where status='ACTIVE'", Long.class))
		    .isZero();
		assertThat(jdbc.queryForObject("select count(*) from payment_events where action='DELETED'", Long.class))
		    .isEqualTo(1);
		assertThat(count("expenses")).isEqualTo(1);
		assertThat(count("expense_allocations")).isEqualTo(1);
		assertThat(jdbc.queryForObject("select count(*) from bank_transactions where deleted_by=?", Long.class, user))
		    .isEqualTo(2);
		banking.deleteMany(user, property, remove);
		assertThat(banking.preview(user, property, file).rows()).hasSize(2);
		assertThat(banking.upload(user, property, file, selection).rows()).hasSize(2);
		// 오래된 삭제 요청을 재시도해도 새 ID로 다시 등록한 거래는 삭제하지 않습니다.
		banking.deleteMany(user, property, remove);
		assertThat(banking.workspace(user, property).rows()).hasSize(2);
		assertThat(count("bank_transactions")).isEqualTo(4);
		assertThat(count("expenses")).isEqualTo(2);
		assertThatThrownBy(() -> jdbc.update("update bank_transactions set deleted_at=null,deleted_by=null where id=?",
		    ids.getFirst())).isInstanceOf(org.springframework.dao.DataAccessException.class);
		assertThatThrownBy(
		    () -> banking.deleteMany(users.saveAndFlush(User.create("다른관리자", null)).getId(), property, remove))
		    .isInstanceOf(AuthException.class);
	}

	@Test
	void openingExamplesKeepHistoricalDebtCreditAndBankBalanceSeparateFromNewIncome() {
		newHandoverTarget();
		var draft = draftHandover(LocalDate.of(2026, 9, 30), "2026-10");
		assertThat(draft.managementStarted()).isFalse();
		confirmHandover(draft);
		assertThat(due(unit)).isEqualByComparingTo("150000");
		assertThat(due(otherUnit)).isEqualByComparingTo("20000");
		UUID third = jdbc.queryForObject("select id from units where property_id=? and unit_number='103'", UUID.class,
		    property);
		UUID fourth = jdbc.queryForObject("select id from units where property_id=? and unit_number='104'", UUID.class,
		    property);
		assertThat(due(third)).isEqualByComparingTo("0");
		assertThat(due(fourth)).isEqualByComparingTo("50000");
		var ledger = service.workspace(user, property);
		assertThat(ledger.payments()).isEmpty();
		assertThat(ledger.openingCredits()).hasSize(2);
		assertThat(ledger.charges()).filteredOn(c -> "MONTHLY".equals(c.chargeType())).hasSize(4);
		assertThat(ledger.charges()).filteredOn(c -> "OPENING_RECEIVABLE".equals(c.chargeType())).hasSize(1);
		assertThat(jdbc.queryForObject("select sum(amount) from credit_applications where property_id=?",
		    java.math.BigDecimal.class, property)).isEqualByComparingTo("80000");
		assertThat(opening.workspace(user, property).accounts().getFirst().amount()).isEqualTo("2000000");
		assertThat(jdbc.queryForObject(
		    "select responsibility_encrypted from opening_balance_items where property_id=? and unit_id=?",
		    String.class, property, unit)).doesNotContain("이전 임차인");
		confirmHandover(draft);
		assertThat(jdbc.queryForObject("select count(*) from charges where property_id=?", Long.class, property))
		    .isEqualTo(5);
	}

	@Test
	void alreadyBilledCurrentMonthStartsNextMonthAndExcludesCutoffDeposits() {
		newHandoverTarget();
		jdbc.update("update bank_accounts set bank_code='081' where property_id=?", property);
		var draft = draftHandover(LocalDate.of(2026, 10, 14), "2026-11");
		confirmHandover(draft);
		assertThat(
		    jdbc.queryForObject("select count(*) from billing_periods where property_id=?", Long.class, property))
		    .isZero();
		assertThat(due(unit)).isEqualByComparingTo("100000");
		var file = csv("입금일,입금자명,입금액\n2026-10-14,인계대표,50000\n2026-10-15,인계대표,25000");
		var preview = service.preview(user, property, file);
		assertThat(preview.duplicateCount()).isEqualTo(1);
		assertThat(preview.rows()).hasSize(1);
		service.importFile(user, property, file);
		assertThat(due(unit)).isEqualByComparingTo("75000");
		assertThat(service.workspace(user, property).payments()).hasSize(1);
		assertThatThrownBy(() -> service.manual(user, property,
		    new PaymentRequests.Manual(UUID.randomUUID(), unit, LocalDate.of(2026, 10, 14), "100")))
		    .isInstanceOfSatisfying(PaymentException.class,
		        e -> assertThat(e.code()).isEqualTo("PAYMENT_BEFORE_OPENING_CUTOFF"));
		clock.set(Instant.parse("2026-10-31T15:00:00Z"));
		billing.generate(property, YearMonth.of(2026, 11));
		assertThat(due(unit)).isEqualByComparingTo("125000");
		assertThat(due(otherUnit)).isEqualByComparingTo("20000");
	}

	@Test
	void initialConfirmationRollsBackAllRecordsIfCreditApplicationFails() {
		newHandoverTarget();
		var draft = draftHandover(LocalDate.of(2026, 9, 30), "2026-10");
		jdbc.execute(
		    "create function fail_opening_application() returns trigger language plpgsql as $$ begin raise exception 'opening failure'; end $$");
		jdbc.execute(
		    "create trigger fail_opening_application before insert on credit_applications for each row execute function fail_opening_application()");
		assertThatThrownBy(() -> confirmHandover(draft)).isInstanceOf(RuntimeException.class);
		assertThat(opening.workspace(user, property).batch().status()).isEqualTo("DRAFT");
		assertThat(opening.workspace(user, property).managementStarted()).isFalse();
		assertThat(jdbc.queryForObject("select count(*) from charges where property_id=?", Long.class, property))
		    .isZero();
		jdbc.execute("drop function fail_opening_application() cascade");
		confirmHandover(draft);
		assertThat(due(unit)).isEqualByComparingTo("150000");
	}

	@Test
	void openingCorrectionPreservesCanceledHistoryAndMonthlyBillsWithoutDuplicateCash() {
		newHandoverTarget();
		var draft = draftHandover(LocalDate.of(2026, 9, 30), "2026-10");
		confirmHandover(draft);
		var confirmed = opening.workspace(user, property);
		opening.cancel(user, property, confirmed.batch().id(),
		    new com.moahome.server.billing.dto.OpeningBalanceRequest.Cancel(confirmed.batch().revision(), "인계 금액 확인"));
		assertThat(opening.workspace(user, property).batch()).isNull();
		var next = draftHandover(LocalDate.of(2026, 9, 30), "2026-10");
		confirmHandover(next);
		assertThat(due(unit)).isEqualByComparingTo("150000");
		assertThat(due(otherUnit)).isEqualByComparingTo("20000");
		assertThat(opening.workspace(user, property).history()).hasSize(2);
		assertThat(jdbc.queryForObject("select count(*) from charges where property_id=? and charge_type='MONTHLY'",
		    Long.class, property)).isEqualTo(4);
		var id = manual("1000");
		service.confirm(user, property, id, new PaymentRequests.Confirm(unit, null, null));
		var latest = opening.workspace(user, property).batch();
		assertThatThrownBy(() -> opening.cancel(user, property, latest.id(),
		    new com.moahome.server.billing.dto.OpeningBalanceRequest.Cancel(latest.revision(), "재정정")))
		    .isInstanceOfSatisfying(PaymentException.class,
		        e -> assertThat(e.code()).isEqualTo("OPENING_ALREADY_HAS_RECEIPTS"));
	}

	@Test
	void concurrentOpeningConfirmationGeneratesOneBatchOfCharges() throws Exception {
		newHandoverTarget();
		var draft = draftHandover(LocalDate.of(2026, 9, 30), "2026-10");
		var gate = new CountDownLatch(1);
		try (var executor = Executors.newFixedThreadPool(2)) {
			var one = executor.submit(() -> {
				gate.await();
				confirmHandover(draft);
				return true;
			});
			var two = executor.submit(() -> {
				gate.await();
				confirmHandover(draft);
				return true;
			});
			gate.countDown();
			assertThat(one.get()).isTrue();
			assertThat(two.get()).isTrue();
		}
		assertThat(jdbc.queryForObject("select count(*) from charges where property_id=?", Long.class, property))
		    .isEqualTo(5);
		assertThat(
		    jdbc.queryForObject("select count(*) from credit_applications where property_id=?", Long.class, property))
		    .isEqualTo(2);
	}

	@Test
	void residentSignupNeedsApprovalAndRoleChangesPreserveResidentAndRepresentative() {
		UUID residentId = jdbc.queryForObject("select id from residents where property_id=? and name='김대표'", UUID.class,
		    property);
		UUID joining = users.saveAndFlush(User.create("가입계정", null)).getId();
		var application = signupRequests.request(joining, property,
		    new com.moahome.server.membership.dto.SignupRequests.Create(unit, "01012345678"));
		assertThat(jdbc.queryForObject("select user_id from residents where id=?", UUID.class, residentId)).isNull();
		assertThatThrownBy(() -> memberManagement.workspace(joining, property)).isInstanceOf(AuthException.class);
		var pending = signupRequests.workspace(user, property).requests().getFirst();
		signupRequests.approve(user, property, application.id(),
		    new com.moahome.server.membership.dto.SignupRequests.Approve(residentId, pending.updatedAt()));
		memberManagement.changeResidentRole(user, property, residentId,
		    new com.moahome.server.membership.dto.MemberRequests.Role(
		        com.moahome.server.membership.domain.PropertyMemberRole.MANAGER,
		        com.moahome.server.membership.domain.PropertyMemberRole.RESIDENT));
		var row = service.workspace(user, property).units().stream().filter(u -> u.id().equals(unit)).findFirst()
		    .orElseThrow();
		assertThat(row.representativeId()).isEqualTo(residentId);
		assertThat(jdbc.queryForObject("select role from property_members where property_id=? and user_id=?",
		    String.class, property, joining)).isEqualTo("MANAGER");
		assertThat(memberManagement.workspace(joining, property).propertyId()).isEqualTo(property);
		memberManagement.changeResidentRole(user, property, residentId,
		    new com.moahome.server.membership.dto.MemberRequests.Role(
		        com.moahome.server.membership.domain.PropertyMemberRole.RESIDENT,
		        com.moahome.server.membership.domain.PropertyMemberRole.MANAGER));
		assertThat(
		    jdbc.queryForObject("select count(*) from member_role_events where property_id=?", Long.class, property))
		    .isEqualTo(3);
	}

	/** 역할 변경 뒤 일반 명부 수정이 실패하면 권한 변경과 이벤트도 같은 트랜잭션에서 되돌립니다. */
	@Test
	void roleChangesInsideResidentEditRollBackTogetherWithInvalidResidentInformation() {
		UUID residentId = jdbc.queryForObject("select id from residents where property_id=? and name='김대표'", UUID.class,
		    property);
		UUID joining = users.saveAndFlush(User.create("가입 계정", null)).getId();
		var created = signupRequests.request(joining, property,
		    new com.moahome.server.membership.dto.SignupRequests.Create(unit, "01012345678"));
		var pending = signupRequests.workspace(user, property).requests().getFirst();
		signupRequests.approve(user, property, created.id(),
		    new com.moahome.server.membership.dto.SignupRequests.Approve(residentId, pending.updatedAt()));
		var detail = residentManagement.detail(user, property, residentId);
		var invalid = new com.moahome.server.resident.dto.ResidentUpdateRequest("이".repeat(51), unit, "OTHER", "KEEP",
		    null, null, detail.updatedAt(), com.moahome.server.membership.domain.PropertyMemberRole.MANAGER,
		    com.moahome.server.membership.domain.PropertyMemberRole.RESIDENT);
		assertThatThrownBy(() -> residentManagement.update(user, property, residentId, invalid))
		    .isInstanceOf(IllegalArgumentException.class);
		assertThat(jdbc.queryForObject("select role from property_members where property_id=? and user_id=?",
		    String.class, property, joining)).isEqualTo("RESIDENT");
		var valid = new com.moahome.server.resident.dto.ResidentUpdateRequest("김대표", unit, "OTHER", "KEEP", null, null,
		    detail.updatedAt(), com.moahome.server.membership.domain.PropertyMemberRole.MANAGER,
		    com.moahome.server.membership.domain.PropertyMemberRole.RESIDENT);
		assertThat(residentManagement.update(user, property, residentId, valid).serviceRole()).isEqualTo("MANAGER");
		assertThat(
		    jdbc.queryForObject("select count(*) from member_role_events where property_id=?", Long.class, property))
		    .isEqualTo(2);
	}

	@Test
	void externalManagerInvitationExpiresAfterOneDayAndTransferKeepsOneChief() {
		UUID joining = users.saveAndFlush(User.create("외부관리자", null)).getId();
		var expired = memberManagement.issue(user, property, null);
		clock.set(Instant.parse("2026-10-16T00:00:00Z"));
		assertThatThrownBy(() -> memberManagement.claim(joining, expired.code())).isInstanceOf(PaymentException.class);
		var invite = memberManagement.issue(user, property, null);
		memberManagement.claim(joining, invite.code());
		var pending = memberManagement.workspace(user, property).invitations().stream()
		    .filter(i -> i.id().equals(invite.id())).findFirst().orElseThrow();
		memberManagement.approve(user, property, pending.id(), pending.revision());
		assertThat(jdbc.queryForObject("select count(*) from residents where property_id=? and user_id=?", Long.class,
		    property, joining)).isZero();
		UUID member = jdbc.queryForObject("select id from property_members where property_id=? and user_id=?",
		    UUID.class, property, joining);
		memberManagement.transfer(user, property, member,
		    com.moahome.server.membership.domain.PropertyMemberRole.MANAGER);
		assertThat(jdbc.queryForObject("select role from property_members where property_id=? and user_id=?",
		    String.class, property, user)).isEqualTo("MANAGER");
		assertThat(jdbc.queryForObject(
		    "select count(*) from property_members where property_id=? and role='ADMIN' and status='ACTIVE'",
		    Long.class, property)).isEqualTo(1);
		assertThat(memberManagement.workspace(user, property).propertyId()).isEqualTo(property);
		assertThat(memberManagement.workspace(joining, property).members()).hasSize(2);
	}

	/** 미리보기에서 선택한 실제 거래만 저장·자동 확정하고 제외 건은 다음 업로드에서 다시 가져올 수 있습니다. */
	@Test
	void selectedBankImportSkipsExcludedRowsAndReusesSelectionOnRetry() {
		var file = csv("입금일,입금자명,입금액\n2026-10-15,김대표,50000\n2026-10-14,미확인입금,12000\n2026-10-13,이대표,30000");
		var preview = service.preview(user, property, file);
		List<UUID> chosen = preview.rows().stream().filter(p -> !p.payer().equals("미확인입금"))
		    .map(PaymentResponse.Payment::id).toList();
		var selection = new PaymentRequests.BankImportSelection(chosen);
		var result = service.importFile(user, property, file, selection);
		assertThat(result.payments()).hasSize(2).allMatch(p -> p.status().equals("CONFIRMED"));
		assertThat(result.payments()).extracting(PaymentResponse.Payment::payer).containsExactlyInAnyOrder("김대표",
		    "이대표");
		assertThat(count("bank_transactions")).isEqualTo(2);
		assertThat(count("payment_allocations")).isEqualTo(2);
		service.importFile(user, property, file, selection);
		assertThat(count("payments")).isEqualTo(2);
		assertThat(count("bank_transactions")).isEqualTo(2);
		var remaining = service.preview(user, property, file);
		assertThat(remaining.duplicateCount()).isEqualTo(2);
		assertThat(remaining.rows()).hasSize(1);
		assertThat(remaining.rows().getFirst().payer()).isEqualTo("미확인입금");
		var all = service.importFile(user, property, file,
		    new PaymentRequests.BankImportSelection(List.of(remaining.rows().getFirst().id())));
		assertThat(all.payments()).hasSize(3);
		assertThat(all.payments().stream().filter(p -> p.payer().equals("미확인입금")).findFirst().orElseThrow().status())
		    .isEqualTo("PENDING");
	}

	/** 빈 선택·파일에 없는 선택·미리보기 후 바뀐 금액은 전체 요청을 거부해 일부 저장이나 전체 가져오기 오작동을 막습니다. */
	@Test
	void invalidBankSelectionsNeverCreateBankOrPaymentRecords() {
		var file = bank("김대표", "50000");
		var valid = service.preview(user, property, file).rows().getFirst().id();
		for (var ids : List.of(List.<UUID>of(), List.of(valid, UUID.randomUUID())))
			assertThatThrownBy(
			    () -> service.importFile(user, property, file, new PaymentRequests.BankImportSelection(ids)))
			    .isInstanceOfSatisfying(PaymentException.class,
			        e -> assertThat(e.code()).isEqualTo("INVALID_BANK_SELECTION"));
		assertThatThrownBy(() -> service.importFile(user, property, bank("김대표", "60000"),
		    new PaymentRequests.BankImportSelection(List.of(valid)))).isInstanceOf(PaymentException.class);
		assertThat(count("bank_transactions")).isZero();
		assertThat(count("payments")).isZero();
		assertThat(count("payment_events")).isZero();
	}

	/** 명부 밖 실제 입금을 확정해도 세대 청구·선입금에 영향을 주지 않고 원본과 암호화 분류를 보존합니다. */
	@Test
	void otherBankIncomeIsSeparateIdempotentAndNeverAllocatedToHouseholds() {
		var file = bank("외부입금자", "93960");
		var original = service.importFile(user, property, file).payments().getFirst();
		var request = new PaymentRequests.OtherIncome("전기료", "외부 사용분");
		var result = service.confirmOtherIncome(user, property, original.id(), request);
		var income = result.payments().getFirst();
		assertThat(income.receiptType()).isEqualTo("OTHER");
		assertThat(income.status()).isEqualTo("CONFIRMED");
		assertThat(income.unitId()).isEmpty();
		assertThat(income.allocations()).isEmpty();
		assertThat(income.incomeCategory()).isEqualTo("전기료");
		assertThat(income.incomeNote()).isEqualTo("외부 사용분");
		assertThat(income.bankTransactionId()).isEqualTo(original.bankTransactionId());
		assertThat(income.payer()).isEqualTo(original.payer());
		assertThat(income.amount()).isEqualTo("93960");
		service.confirmOtherIncome(user, property, original.id(), request);
		service.confirmMatches(user, property);
		clock.set(Instant.parse("2026-11-01T00:00:00Z"));
		billing.generate(property, YearMonth.of(2026, 11));
		assertThat(count("payment_allocations")).isZero();
		assertThat(count("payments")).isEqualTo(1);
		assertThat(service.preview(user, property, file).duplicateCount()).isEqualTo(1);
		assertThat(
		    jdbc.queryForObject("select income_category_encrypted from payments where id=?", String.class, income.id()))
		    .doesNotContain("전기료");
		assertThat(
		    jdbc.queryForObject("select income_note_encrypted from payments where id=?", String.class, income.id()))
		    .doesNotContain("외부 사용분");
		assertThat(jdbc.queryForObject("select count(*) from payment_events where action='OTHER_INCOME_CONFIRMED'",
		    Long.class)).isEqualTo(1);
		assertThatThrownBy(() -> service.confirmOtherIncome(user, property, original.id(),
		    new PaymentRequests.OtherIncome("이자", null))).isInstanceOf(PaymentException.class);
		assertThatThrownBy(
		    () -> service.confirm(user, property, original.id(), new PaymentRequests.Confirm(unit, null, null)))
		    .isInstanceOf(PaymentException.class);
	}

	/** 분류 취소는 최초 이력을 보존하고 같은 원본을 다시 검토하게 하며 재요청으로 초안을 늘리지 않습니다. */
	@Test
	void cancelOtherIncomeRestoresReviewDraftAndAllowsHouseholdReclassification() {
		var file = bank("외부입금자", "50000");
		var original = service.importFile(user, property, file).payments().getFirst();
		service.confirmOtherIncome(user, property, original.id(), new PaymentRequests.OtherIncome("기타", null));
		service.cancel(user, property, original.id(), "분류 정정");
		var canceled = service.cancel(user, property, original.id(), "다른 사유");
		assertThat(canceled.payments()).hasSize(2);
		var history = canceled.payments().stream().filter(p -> p.id().equals(original.id())).findFirst().orElseThrow();
		assertThat(history.status()).isEqualTo("CANCELED");
		assertThat(history.receiptType()).isEqualTo("OTHER");
		assertThat(history.incomeCategory()).isEqualTo("기타");
		assertThat(history.cancelReason()).isEqualTo("분류 정정");
		var draft = canceled.payments().stream().filter(p -> p.status().equals("PENDING")).findFirst().orElseThrow();
		assertThat(draft.receiptType()).isEqualTo("HOUSEHOLD");
		assertThat(draft.incomeCategory()).isNull();
		assertThat(draft.bankTransactionId()).isEqualTo(original.bankTransactionId());
		assertThat(service.preview(user, property, file).duplicateCount()).isEqualTo(1);
		assertThat(service.confirm(user, property, draft.id(), new PaymentRequests.Confirm(unit, null, null)).payments()
		    .stream().filter(p -> p.id().equals(draft.id())).findFirst().orElseThrow().allocations()).hasSize(1);
		assertThat(count("bank_transactions")).isEqualTo(1);
	}

	/** 기타 분류도 관리자 권한·상태·원본 중복 검사를 우회할 수 없으며 감사 저장 실패 시 원자적으로 롤백합니다. */
	@Test
	void otherIncomeRejectsInvalidStatesAndRollsBackAuditFailure() {
		var original = service.importFile(user, property, bank("외부입금자", "50000")).payments().getFirst();
		var request = new PaymentRequests.OtherIncome("기타", null);
		UUID outsider = users.saveAndFlush(User.create("다른 관리자", null)).getId();
		assertThatThrownBy(() -> service.confirmOtherIncome(outsider, property, original.id(), request))
		    .isInstanceOf(AuthException.class);
		assertThatThrownBy(
		    () -> service.confirmOtherIncome(user, property, original.id(), new PaymentRequests.OtherIncome(" ", null)))
		    .isInstanceOf(PaymentException.class);
		assertThatThrownBy(() -> service.confirmOtherIncome(user, property, manual("50000"), request))
		    .isInstanceOf(PaymentException.class);
		service.hold(user, property, original.id(), "확인 중");
		assertThatThrownBy(() -> service.confirmOtherIncome(user, property, original.id(), request))
		    .isInstanceOf(PaymentException.class);
		service.resume(user, property, original.id());
		jdbc.execute(
		    "create function fail_payment_event() returns trigger language plpgsql as $$ begin if NEW.action='OTHER_INCOME_CONFIRMED' then raise exception 'test failure';end if;return NEW;end $$");
		jdbc.execute(
		    "create trigger payment_event_failure before insert on payment_events for each row execute function fail_payment_event()");
		assertThatThrownBy(() -> service.confirmOtherIncome(user, property, original.id(), request))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
		var unchanged = service.workspace(user, property).payments().stream().filter(p -> p.id().equals(original.id()))
		    .findFirst().orElseThrow();
		assertThat(unchanged.status()).isEqualTo("PENDING");
		assertThat(unchanged.receiptType()).isEqualTo("HOUSEHOLD");
		assertThat(unchanged.incomeCategory()).isNull();
		assertThat(count("payment_allocations")).isZero();
	}

	/** DB도 기타 입금에 세대 연결·청구 충당을 허용하지 않아 SQL 우회로 수납 합계가 변하지 않습니다. */
	@Test
	void databaseRejectsHouseholdLinksAndAllocationsForOtherIncome() {
		var original = service.importFile(user, property, bank("외부입금자", "50000")).payments().getFirst();
		service.confirmOtherIncome(user, property, original.id(), new PaymentRequests.OtherIncome("기타", null));
		assertThatThrownBy(() -> jdbc.update("update payments set matched_unit_id=? where id=?", unit, original.id()))
		    .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
		assertThatThrownBy(() -> new TransactionTemplate(transactionManager).execute(status -> {
			jdbc.update(
			    "insert into payment_allocations(id,property_id,payment_id,charge_id,allocated_amount,status,allocated_by,allocated_at) values (?,?,?,?,100,'ACTIVE',?,now())",
			    UUID.randomUUID(), property, original.id(), charge, user);
			return null;
		})).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
		assertThat(count("payment_allocations")).isZero();
	}

	@Test
	void realRepresentativesAndIssuedChargesAreUsedAndManualRetriesDoNotDuplicate() {
		var ledger = service.workspace(user, property);
		assertThat(ledger.units()).extracting(PaymentResponse.Unit::representativeName).containsExactly("김대표", "이대표");
		assertThat(ledger.units().stream().filter(u -> u.id().equals(unit)).findFirst().orElseThrow().residentNames())
		    .containsExactlyInAnyOrder("김대표", "김가족");
		assertThat(ledger.charges())
		    .allMatch(c -> c.amount().equals("50000") && c.dueDate().equals(LocalDate.of(2026, 10, 31)));
		UUID id = manual("80000");
		var input = new PaymentRequests.Manual(id, unit, LocalDate.of(2026, 10, 15), "80000");
		service.manual(user, property, input);
		var saved = service.confirm(user, property, id, confirm("50000"));
		service.confirm(user, property, id, confirm("50000"));
		var payment = saved.payments().stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow();
		assertThat(payment.payer()).isEqualTo("김대표");
		assertThat(payment.amount()).isEqualTo("80000");
		assertThat(payment.allocations().getFirst().amount()).isEqualTo("50000");
		assertThat(count("payments")).isEqualTo(1);
		assertThat(count("payment_allocations")).isEqualTo(1);
		assertThat(jdbc.queryForObject("select payer_name_encrypted from payments where id=?", String.class, id))
		    .doesNotContain("김대표");
		assertThat(jdbc.queryForObject("select count(*) from payment_events where action='CONFIRMED'", Long.class))
		    .isEqualTo(1);
	}

	@Test
	void bankImportMatchesRosterNamesAndDeduplicatesDateNameAmountAcrossFiles() {
		assertThat(service.preview(user, property, bank("김대표", "50000")).rows().getFirst().unitId())
		    .isEqualTo(unit.toString());
		assertThat(service.preview(user, property, bank("김가족", "50000")).rows().getFirst().unitId())
		    .isEqualTo(unit.toString());
		assertThat(count("payments")).isZero();
		assertThat(count("bank_transactions")).isZero();
		service.importFile(user, property, bank("김대표", "50000"));
		var different = csv("입금일,입금자명,입금액,적요\n2026-10-15,김대표,50000,다른 파일의 적요");
		assertThat(service.preview(user, property, different).duplicateCount()).isEqualTo(1);
		service.importFile(user, property, different);
		assertThat(count("payments")).isEqualTo(1);
		assertThat(count("bank_transactions")).isEqualTo(1);
		resident(otherUnit, "김대표", false);
		assertThat(service.preview(user, property, bank("김대표", "60000")).rows().getFirst().unitId()).isEmpty();
	}

	@Test
	void bankXlsPreviewImportConfirmationAndReuploadReuseOneReceipt() throws Exception {
		try (var workbook = new org.apache.poi.hssf.usermodel.HSSFWorkbook();
		    var bytes = new java.io.ByteArrayOutputStream()) {
			var sheet = workbook.createSheet("거래내역조회");
			sheet.createRow(0).createCell(0).setCellValue("거래내역조회");
			var header = sheet.createRow(5);
			List<String> labels = List.of("거래일시", "구분", "적요", "출금액", "입금액", "잔액", "거래점");
			for (int i = 0; i < labels.size(); i++)
				header.createCell(i).setCellValue(labels.get(i));
			for (int i = 0; i < 2; i++) {
				var row = sheet.createRow(6 + i);
				row.createCell(0).setCellValue("2026-10-15 09:12:34");
				row.createCell(2).setCellValue(i == 0 ? "김대표" : "청소비");
				row.createCell(3).setCellValue(i == 0 ? 0 : 20000);
				row.createCell(4).setCellValue(i == 0 ? 50000 : 0);
				row.createCell(5).setCellValue(i == 0 ? 150000 : 130000);
			}
			workbook.write(bytes);
			var file = new MockMultipartFile("file", "거래내역조회.xls", "application/vnd.ms-excel", bytes.toByteArray());
			var preview = service.preview(user, property, file);
			assertThat(preview.rows()).hasSize(1);
			assertThat(preview.rows().getFirst().unitId()).isEqualTo(unit.toString());
			assertThat(count("bank_transactions")).isZero();
			assertThat(count("payments")).isZero();
			var imported = service.importFile(user, property, file).payments().getFirst();
			assertThat(imported.status()).isEqualTo("CONFIRMED");
			assertThat(imported.memo()).isEqualTo("김대표");
			assertThat(count("payment_allocations")).isEqualTo(1);
			assertThat(jdbc.queryForObject("select transaction_time::text from bank_transactions", String.class))
			    .isEqualTo("09:12:34");
			assertThat(jdbc.queryForObject("select balance::text from bank_transactions", String.class))
			    .isEqualTo("150000");
			service.confirm(user, property, imported.id(), confirm("50000"));
			assertThat(service.preview(user, property, file).duplicateCount()).isEqualTo(1);
			service.importFile(user, property, file);
			assertThat(count("bank_transactions")).isEqualTo(1);
			assertThat(count("payments")).isEqualTo(1);
			assertThat(count("payment_allocations")).isEqualTo(1);
		}
	}

	/** 동·호수 표기는 공백 차이나 마지막 호 생략에도 같은 실제 세대를 후보로 표시하며 은행 원문은 변경하지 않습니다. */
	@Test
	void buildingAndUnitPayerSuggestsExistingUnitWithoutRenamingResident() {
		UUID building = UUID.randomUUID();
		jdbc.update("update properties set has_buildings=true where id=?", property);
		jdbc.update(
		    "insert into buildings(id,property_id,name,sort_order,status,created_at,updated_at) values (?,?,'102동',0,'ACTIVE',now(),now())",
		    building, property);
		jdbc.update("update units set building_id=?,unit_number='401' where id=?", building, unit);
		for (String payer : List.of("102동401호", "102동 401호", "102동  401호", "102동401", "102동 401")) {
			var row = service.preview(user, property, bank(payer, "50000")).rows().getFirst();
			assertThat(row.unitId()).isEqualTo(unit.toString());
			assertThat(row.reason()).isEqualTo("동·호수 일치");
			assertThat(row.payer()).isEqualTo(payer);
		}
		assertThat(service.preview(user, property, bank("102동999호", "50000")).rows().getFirst().unitId()).isEmpty();
		assertThat(service.preview(user, property, bank("김대표", "50000")).rows().getFirst().unitId())
		    .isEqualTo(unit.toString());
		var imported = service.importFile(user, property, bank("102동401호", "50000")).payments().getFirst();
		assertThat(imported.unitId()).isEqualTo(unit.toString());
		assertThat(jdbc.queryForObject("select matched_unit_id from payments where id=?", UUID.class, imported.id()))
		    .isEqualTo(unit);
		assertThat(service.workspace(user, property).units().stream().filter(u -> u.id().equals(unit)).findFirst()
		    .orElseThrow().representativeName()).isEqualTo("김대표");
	}

	/** '호'가 없는 실제 은행 표기도 조회·재매칭·새 가져오기에서 동일한 세대에 연결합니다. */
	@Test
	void missingHoMatchesExistingPendingAndAutoConfirmsNewDepositsWithoutPartialMatches() {
		var original = bank("103동501", "50000");
		var pending = service.importFile(user, property, original).payments().getFirst();
		assertThat(pending.unitId()).isEmpty();
		assertThat(pending.status()).isEqualTo("PENDING");
		UUID building = UUID.randomUUID();
		jdbc.update("update properties set has_buildings=true where id=?", property);
		jdbc.update(
		    "insert into buildings(id,property_id,name,sort_order,status,created_at,updated_at) values (?,?,'103동',0,'ACTIVE',now(),now())",
		    building, property);
		jdbc.update("update units set building_id=?,unit_number='501' where id=?", building, unit);
		var candidate = service.workspace(user, property).payments().getFirst();
		assertThat(candidate.unitId()).isEqualTo(unit.toString());
		assertThat(candidate.reason()).isEqualTo("동·호수 일치");
		for (String payer : List.of("103동50", "103동501관리비", "103동501호호", "104동501"))
			assertThat(service.preview(user, property, bank(payer, "50000")).rows().getFirst().unitId()).isEmpty();
		var confirmed = service.confirmMatches(user, property).payments().getFirst();
		assertThat(confirmed.unitId()).isEqualTo(unit.toString());
		assertThat(confirmed.status()).isEqualTo("CONFIRMED");
		assertThat(confirmed.payer()).isEqualTo("103동501");
		var next = csv("입금일,입금자명,입금액\n2026-10-14,103동 501,50000");
		var imported = service.importFile(user, property, next);
		assertThat(imported.payments()).hasSize(2)
		    .allMatch(p -> p.status().equals("CONFIRMED") && p.unitId().equals(unit.toString()));
		assertThat(service.preview(user, property, original).duplicateCount()).isEqualTo(1);
		assertThat(service.preview(user, property, next).duplicateCount()).isEqualTo(1);
		assertThat(jdbc.queryForObject("select sum(amount)::text from payments where status='CONFIRMED'", String.class))
		    .isEqualTo("100000");
		assertThat(jdbc.queryForObject(
		    "select sum(allocated_amount)::text from payment_allocations where status='ACTIVE'", String.class))
		    .isEqualTo("50000");
	}

	/** 같은 달 여러 실제 입금은 모두 수납하며 이미 완납한 세대의 추가 입금도 전액 선입금으로 유지합니다. */
	@Test
	void repeatedDepositsAccumulateAndPrepaymentAutomaticallyPaysNextMonth() {
		var file = csv("입금일,입금자명,입금액\n2026-10-06,같은입금자,50000\n2026-10-13,같은입금자,50000");
		var imported = service.importFile(user, property, file);
		assertThat(imported.payments()).hasSize(2);
		var request = new PaymentRequests.Confirm(unit, null, null);
		for (var payment : imported.payments())
			service.confirm(user, property, payment.id(), request);
		service.confirm(user, property, imported.payments().getFirst().id(), request);
		assertThat(jdbc.queryForObject("select sum(amount)::text from payments where status='CONFIRMED'", String.class))
		    .isEqualTo("100000");
		assertThat(jdbc.queryForObject(
		    "select sum(allocated_amount)::text from payment_allocations where status='ACTIVE'", String.class))
		    .isEqualTo("50000");
		assertThat(service.workspace(user, property).payments()).allMatch(p -> p.status().equals("CONFIRMED"));
		assertThat(service.preview(user, property, file).duplicateCount()).isEqualTo(2);
		service.importFile(user, property, file);
		assertThat(count("payments")).isEqualTo(2);
		clock.set(Instant.parse("2026-11-01T00:00:00Z"));
		assertThat(billing.generate(property, java.time.YearMonth.of(2026, 11))).isTrue();
		assertThat(jdbc.queryForObject(
		    "select sum(allocated_amount)::text from payment_allocations where status='ACTIVE'", String.class))
		    .isEqualTo("100000");
		var nextCharge = service.workspace(user, property).charges().stream()
		    .filter(c -> c.unitId().equals(unit) && c.month().equals("2026-11")).findFirst().orElseThrow();
		assertThat(service.workspace(user, property).payments().stream().flatMap(p -> p.allocations().stream())
		    .filter(a -> a.chargeId().equals(nextCharge.id()))).hasSize(1);
	}

	@Test
	void matchingNamesAutoConfirmRepeatedDepositsAndNextMonthUsesAdvanceWithoutManualAction() {
		var file = csv("입금일,입금자명,입금액\n2026-10-06,김대표,50000\n2026-10-13,김가족,50000");
		assertThat(service.preview(user, property, file).rows()).allMatch(p -> p.status().equals("PENDING"));
		assertThat(count("payments")).isZero();
		var imported = service.importFile(user, property, file);
		assertThat(imported.payments()).hasSize(2)
		    .allMatch(p -> p.status().equals("CONFIRMED") && p.unitId().equals(unit.toString()));
		assertThat(jdbc.queryForObject("select sum(amount)::text from payments where status='CONFIRMED'", String.class))
		    .isEqualTo("100000");
		assertThat(jdbc.queryForObject(
		    "select sum(allocated_amount)::text from payment_allocations where status='ACTIVE'", String.class))
		    .isEqualTo("50000");
		assertThat(jdbc.queryForObject("select count(*) from payment_events where action='AUTO_CONFIRMED'", Long.class))
		    .isEqualTo(2);
		service.importFile(user, property, file);
		assertThat(count("payments")).isEqualTo(2);
		clock.set(Instant.parse("2026-11-01T00:00:00Z"));
		billing.generate(property, java.time.YearMonth.of(2026, 11));
		assertThat(jdbc.queryForObject(
		    "select sum(allocated_amount)::text from payment_allocations where status='ACTIVE'", String.class))
		    .isEqualTo("100000");
	}

	@Test
	void bulkConfirmsExistingUniqueMatchesButLeavesAmbiguousHeldAndDuplicateManualReceipts() {
		var file = csv("입금일,입금자명,입금액\n2026-10-06,새이름,50000\n2026-10-07,동명이인,50000\n2026-10-08,보류할이름,50000");
		var imported = service.importFile(user, property, file);
		var held = imported.payments().stream().filter(p -> p.payer().equals("보류할이름")).findFirst().orElseThrow();
		service.hold(user, property, held.id(), "별도 확인 필요");
		resident(unit, "새이름", false);
		resident(unit, "동명이인", false);
		resident(otherUnit, "동명이인", false);
		resident(unit, "보류할이름", false);
		var result = service.confirmMatches(user, property);
		service.confirmMatches(user, property);
		assertThat(result.payments().stream().filter(p -> p.payer().equals("새이름")).findFirst().orElseThrow().status())
		    .isEqualTo("CONFIRMED");
		assertThat(result.payments().stream().filter(p -> p.payer().equals("동명이인")).findFirst().orElseThrow().status())
		    .isEqualTo("PENDING");
		assertThat(result.payments().stream().filter(p -> p.id().equals(held.id())).findFirst().orElseThrow().status())
		    .isEqualTo("ON_HOLD");
		UUID manual = manual("50000");
		service.confirm(user, property, manual, new PaymentRequests.Confirm(unit, null, null));
		var duplicate = service.importFile(user, property, bank("김대표", "50000")).payments().stream()
		    .filter(p -> p.payer().equals("김대표") && p.source().equals("BANK_IMPORT")).findFirst().orElseThrow();
		assertThat(duplicate.status()).isEqualTo("PENDING");
		assertThat(service.confirmMatches(user, property).payments().stream().filter(p -> p.id().equals(duplicate.id()))
		    .findFirst().orElseThrow().status()).isEqualTo("PENDING");
	}

	@Test
	void cumulativeConcurrentReceiptsBothConfirmWithoutOverpayingCharge() throws Exception {
		UUID first = manual("50000"), second = manual("50000");
		var start = new CountDownLatch(1);
		try (var pool = Executors.newFixedThreadPool(2)) {
			List<Future<Boolean>> results = List.of(first, second).stream().map(id -> pool.submit(() -> {
				start.await();
				service.confirm(user, property, id, new PaymentRequests.Confirm(unit, null, null));
				return true;
			})).toList();
			start.countDown();
			for (var result : results)
				assertThat(result.get(10, TimeUnit.SECONDS)).isTrue();
		}
		assertThat(jdbc.queryForObject("select count(*) from payments where status='CONFIRMED'", Long.class))
		    .isEqualTo(2);
		assertThat(jdbc.queryForObject(
		    "select sum(allocated_amount)::text from payment_allocations where status='ACTIVE'", String.class))
		    .isEqualTo("50000");
		service.cancel(user, property, first, "잘못 연결한 수납 취소");
		assertThat(jdbc.queryForObject(
		    "select sum(allocated_amount)::text from payment_allocations where status='ACTIVE'", String.class))
		    .isEqualTo("50000");
		assertThat(jdbc.queryForObject("select sum(amount)::text from payments where status='CONFIRMED'", String.class))
		    .isEqualTo("50000");
	}

	@Test
	void failureDuringCumulativeApplicationRollsBackReceiptAndAllAllocations() {
		UUID id = manual("80000");
		jdbc.execute(
		    "create function fail_payment_event() returns trigger language plpgsql as $$ begin if NEW.action='CUMULATIVE_APPLIED' then raise exception 'test failure';end if;return NEW;end $$");
		jdbc.execute(
		    "create trigger payment_event_failure before insert on payment_events for each row execute function fail_payment_event()");
		assertThatThrownBy(() -> service.confirm(user, property, id, new PaymentRequests.Confirm(unit, null, null)))
		    .isInstanceOf(RuntimeException.class);
		assertThat(count("payment_allocations")).isZero();
		assertThat(jdbc.queryForObject("select status from payments where id=?", String.class, id))
		    .isEqualTo("PENDING");
		assertThat(jdbc.queryForObject("select count(*) from payment_events where action='CONFIRMED'", Long.class))
		    .isZero();
	}

	@Test
	void duplicateManualLinksWithoutIncreasingReceiptsAndCancellationRestoresBankReview() {
		UUID manual = manual("50000");
		service.confirm(user, property, manual, confirm("50000"));
		var ledger = service.importFile(user, property, bank("김대표", "50000"));
		var bank = ledger.payments().stream().filter(p -> p.source().equals("BANK_IMPORT")).findFirst().orElseThrow();
		assertThatThrownBy(() -> service.confirm(user, property, bank.id(), confirm("50000")))
		    .isInstanceOf(PaymentException.class);
		var linked = service.link(user, property, bank.id(), manual);
		assertThat(linked.payments().stream().filter(p -> p.status().equals("CONFIRMED"))).hasSize(1);
		assertThat(count("payment_allocations")).isEqualTo(1);
		var canceled = service.cancel(user, property, manual, "세대 확인 정정");
		service.cancel(user, property, manual, "다른 사유");
		assertThat(
		    canceled.payments().stream().filter(p -> p.id().equals(bank.id())).findFirst().orElseThrow().status())
		    .isEqualTo("PENDING");
		assertThat(jdbc.queryForObject("select count(*) from payment_allocations where status='ACTIVE'", Long.class))
		    .isZero();
		assertThat(service.workspace(user, property).payments().stream().filter(p -> p.id().equals(manual)).findFirst()
		    .orElseThrow().cancelReason()).isEqualTo("세대 확인 정정");
	}

	@Test
	void holdResumeAndCancelBankKeepOriginalAndCreateOneReviewDraft() {
		var p = service.importFile(user, property, bank("확인할입금", "50000")).payments().getFirst();
		service.hold(user, property, p.id(), "입금자 확인");
		service.resume(user, property, p.id());
		service.confirm(user, property, p.id(), confirm("50000"));
		var canceled = service.cancel(user, property, p.id(), "잘못된 확정");
		service.cancel(user, property, p.id(), "재요청");
		assertThat(canceled.payments().stream().filter(row -> row.status().equals("PENDING"))).hasSize(1);
		assertThat(count("bank_transactions")).isEqualTo(1);
		assertThat(count("payments")).isEqualTo(2);
	}

	@Test
	void concurrentConfirmationsCannotExceedSameCharge() throws Exception {
		UUID first = manual("50000"), second = manual("50000");
		var start = new CountDownLatch(1);
		try (var pool = Executors.newFixedThreadPool(2)) {
			List<Future<Boolean>> results = new ArrayList<>();
			for (UUID id : List.of(first, second))
				results.add(pool.submit(() -> {
					start.await();
					try {
						service.confirm(user, property, id, confirm("50000"));
						return true;
					} catch (PaymentException exception) {
						return false;
					}
				}));
			start.countDown();
			int success = 0;
			for (var result : results)
				if (result.get(10, TimeUnit.SECONDS))
					success++;
			assertThat(success).isEqualTo(1);
		}
		assertThat(jdbc.queryForObject(
		    "select sum(allocated_amount)::text from payment_allocations where status='ACTIVE'", String.class))
		    .isEqualTo("50000");
	}

	@Test
	void confirmedReceiptUsesCancellationAndKeepsBankOriginalForReview() {
		var file = bank("김대표", "80000");
		var payment = service.importFile(user, property, file).payments().getFirst();
		assertThatThrownBy(() -> service.delete(user, property, payment.id())).isInstanceOf(PaymentException.class)
		    .extracting(e -> ((PaymentException) e).code()).isEqualTo("PAYMENT_DELETE_NOT_ALLOWED");
		assertThat(service.workspace(user, property).payments()).hasSize(1)
		    .allMatch(p -> p.status().equals("CONFIRMED"));
		var canceled = service.cancel(user, property, payment.id(), "납부 세대 확인 정정");
		assertThat(canceled.payments()).hasSize(2);
		assertThat(canceled.payments().stream().filter(p -> p.status().equals("PENDING"))).hasSize(1);
		assertThat(jdbc.queryForObject("select count(*) from payment_allocations where status='ACTIVE'", Long.class))
		    .isZero();
		assertThat(service.preview(user, property, file).duplicateCount()).isEqualTo(1);
		service.confirmMatches(user, property);
		assertThat(service.workspace(user, property).payments()).noneMatch(p -> p.status().equals("CONFIRMED"));
	}

	@Test
	void deleteUnpaidReceiptAllowsSameExcelRowToBeImportedAgainExactlyOnce() {
		var file = bank("확인할이름", "50000");
		var payment = service.importFile(user, property, file).payments().getFirst();
		assertThat(service.delete(user, property, payment.id()).payments()).isEmpty();
		service.delete(user, property, payment.id());
		assertThat(jdbc.queryForObject("select deleted_by from payments where id=?", UUID.class, payment.id()))
		    .isEqualTo(user);
		assertThat(jdbc.queryForObject("select count(*) from payment_events where action='DELETED'", Long.class))
		    .isEqualTo(1);
		assertThat(service.preview(user, property, file).duplicateCount()).isZero();
		assertThat(service.preview(user, property, file).rows()).hasSize(1);
		var reimported = service.importFile(user, property, file);
		service.importFile(user, property, file);
		assertThat(reimported.payments()).hasSize(1)
		    .allMatch(p -> p.status().equals("PENDING") && !p.id().equals(payment.id()));
		assertThat(count("bank_transactions")).isEqualTo(2);
		assertThat(jdbc.queryForObject("select count(*) from bank_transactions where deleted_at is null", Long.class))
		    .isEqualTo(1);
		assertThat(service.preview(user, property, file).duplicateCount()).isEqualTo(1);
	}

	@Test
	void deletePendingHeldAndManualDraftsAndEnforceScope() {
		var pending = service.importFile(user, property, bank("미확인", "10000")).payments().getFirst();
		assertThatThrownBy(() -> service.delete(user, UUID.randomUUID(), pending.id()))
		    .isInstanceOf(AuthException.class);
		service.hold(user, property, pending.id(), "확인");
		service.delete(user, property, pending.id());
		UUID draft = manual("50000");
		service.delete(user, property, draft);
		assertThat(service.workspace(user, property).payments()).isEmpty();
		var newPending = service.importFile(user, property, bank("또다른미확인", "20000")).payments().getFirst();
		service.delete(user, property, newPending.id());
		assertThat(service.workspace(user, property).payments()).isEmpty();
	}

	@Test
	void failedDeleteRollsBackDraftAndBankDeduplicationKeyTogether() {
		var file = bank("미확인", "50000");
		var payment = service.importFile(user, property, file).payments().getFirst();
		jdbc.execute(
		    "create function fail_payment_event() returns trigger language plpgsql as $$ begin if NEW.action='DELETED' then raise exception 'test failure';end if;return NEW;end $$");
		jdbc.execute(
		    "create trigger payment_event_failure before insert on payment_events for each row execute function fail_payment_event()");
		assertThatThrownBy(() -> service.delete(user, property, payment.id())).isInstanceOf(RuntimeException.class);
		assertThat(service.workspace(user, property).payments()).hasSize(1).allMatch(p -> p.status().equals("PENDING"));
		assertThat(jdbc.queryForObject("select count(*) from bank_transactions where deleted_at is null", Long.class))
		    .isEqualTo(1);
		assertThat(service.preview(user, property, file).duplicateCount()).isEqualTo(1);
	}

	@Test
	void oldDepositCanBeManuallyConfirmedAgainstCurrentUnitWithoutReceiptMonthBill() {
		var file = csv("입금일,입금자명,입금액\n2026-08-20,103-302(8),50000");
		var payment = service.importFile(user, property, file).payments().getFirst();
		assertThat(payment.unitId()).isEmpty();
		assertThat(payment.status()).isEqualTo("PENDING");
		var confirmed = service.confirm(user, property, payment.id(), new PaymentRequests.Confirm(unit, null, null));
		assertThat(confirmed.payments().getFirst().status()).isEqualTo("CONFIRMED");
		assertThat(confirmed.payments().getFirst().payer()).isEqualTo("103-302(8)");
		assertThat(confirmed.payments().getFirst().allocations()).hasSize(1);
	}

	@Test
	void selectedDeletionIsAtomicAndDeletedRowsCanBeReimported() {
		var file = csv("입금일,입금자명,입금액\n2026-08-01,미확인하나,50000\n2026-08-02,미확인둘,50000");
		var imported = service.importFile(user, property, file);
		List<UUID> ids = imported.payments().stream().map(PaymentResponse.Payment::id).toList();
		UUID confirmed = manual("50000");
		service.confirm(user, property, confirmed, new PaymentRequests.Confirm(unit, null, null));
		assertThatThrownBy(() -> service.deleteMany(user, property,
		    new PaymentRequests.DeleteMany(List.of(ids.getFirst(), confirmed)))).isInstanceOf(PaymentException.class);
		assertThat(service.preview(user, property, file).duplicateCount()).isEqualTo(2);
		assertThat(service.workspace(user, property).payments()).hasSize(3);
		service.deleteMany(user, property, new PaymentRequests.DeleteMany(ids));
		assertThat(service.preview(user, property, file).rows()).hasSize(2);
		assertThat(service.importFile(user, property, file).payments()).hasSize(3);
	}

	@Test
	void migrationReleasesPreviouslyDeletedOrphanBankKeysAndKeepsActiveReceipts() {
		var file = csv("입금일,입금자명,입금액\n2026-08-01,삭제할입금,50000\n2026-08-02,유지할입금,50000");
		var imported = service.importFile(user, property, file);
		var deleted = imported.payments().stream().filter(p -> p.payer().equals("삭제할입금")).findFirst().orElseThrow();
		service.delete(user, property, deleted.id());
		String schema = "bank_reimport_" + UUID.randomUUID().toString().replace("-", "");
		var previous = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
		    .schemas(schema).defaultSchema(schema).target("20261016120311").load();
		previous.migrate();
		for (String table : List.of("users", "properties", "buildings", "units", "bank_accounts", "residents",
		    "bank_transactions", "payments")) {
			String columns = jdbc.queryForObject(
			    "select string_agg(quote_ident(column_name),',' order by ordinal_position) from information_schema.columns where table_schema=? and table_name=?",
			    String.class, schema, table);
			jdbc.execute("insert into " + schema + "." + table + "(" + columns + ") select " + columns + " from public."
			    + table);
		}
		var upgraded = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
		    .schemas(schema).defaultSchema(schema).load();
		int pendingMigrations = upgraded.info().pending().length;
		assertThat(pendingMigrations).isPositive();
		assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(pendingMigrations);
		upgraded.validate();
		assertThat(jdbc.queryForObject(
		    "select count(*) from " + schema + ".bank_transactions where deleted_at is not null", Long.class))
		    .isEqualTo(1);
		assertThat(jdbc.queryForObject("select count(*) from " + schema + ".bank_transactions where deleted_at is null",
		    Long.class)).isEqualTo(1);
		assertThat(
		    jdbc.queryForObject("select count(*) from " + schema + ".payments where deleted_at is null", Long.class))
		    .isEqualTo(1);
		String columns = "property_id,bank_account_id,transaction_date,amount,payer_name_encrypted,payer_name_hmac,memo_encrypted,bank_reference,deduplication_key,imported_by,imported_at";
		jdbc.execute("insert into " + schema + ".bank_transactions(id," + columns + ") select gen_random_uuid(),"
		    + columns + " from " + schema + ".bank_transactions where deleted_at is not null");
		assertThatThrownBy(() -> jdbc
		    .execute("insert into " + schema + ".bank_transactions(id," + columns + ") select gen_random_uuid(),"
		        + columns + " from " + schema + ".bank_transactions where deleted_at is not null"))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
		jdbc.execute("drop schema " + schema + " cascade");
	}

	/** 이미 적용한 초기 파일은 보존하고 후속 Migration에서 미완료 주민 코드만 철회합니다. */
	@Test
	void residentInvitationUpgradePreservesApprovedHistoryAndAppliedChecksums() {
		String schema = "resident_invitation_upgrade_" + UUID.randomUUID().toString().replace("-", "");
		var previous = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
		    .schemas(schema).defaultSchema(schema).target("20261017010845").load();
		previous.migrate();
		for (String table : List.of("users", "properties", "buildings", "units", "residents"))
			copyPreviousTable(schema, table);
		var resident = jdbc.queryForObject(
		    "select id from residents where property_id=? and deleted_at is null limit 1", UUID.class, property);
		UUID pending = UUID.randomUUID(), approved = UUID.randomUUID();
		for (var id : List.of(pending, approved)) {
			boolean finished = id.equals(approved);
			jdbc.update("insert into " + schema
			    + ".member_invitations(id,property_id,resident_id,unit_id,token_hash,role,status,created_by,created_at,expires_at,requested_by,requested_at,reviewed_by,reviewed_at) "
			    + "values (?,?,?,?,?,'RESIDENT',?,?,now(),now()+interval '1 day',?,now(),?,?)", id, property, resident,
			    unit, (finished ? "a" : "b").repeat(64), finished ? "APPROVED" : "REQUESTED", user, user,
			    finished ? user : null, finished ? OffsetDateTime.now(clock) : null);
		}
		assertThat(jdbc.queryForObject(
		    "select checksum from " + schema + ".flyway_schema_history where version='20261017005820'", Integer.class))
		    .isEqualTo(2081659831);
		assertThat(jdbc.queryForObject(
		    "select checksum from " + schema + ".flyway_schema_history where version='20261017010845'", Integer.class))
		    .isEqualTo(1109723267);
		var upgraded = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
		    .schemas(schema).defaultSchema(schema).load();
		int pendingMigrations = upgraded.info().pending().length;
		assertThat(pendingMigrations).isPositive();
		assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(pendingMigrations);
		upgraded.validate();
		assertThat(jdbc.queryForObject("select status from " + schema + ".member_invitations where id=?", String.class,
		    pending)).isEqualTo("REVOKED");
		assertThat(jdbc.queryForObject("select status from " + schema + ".member_invitations where id=?", String.class,
		    approved)).isEqualTo("APPROVED");
		assertThat(jdbc.queryForObject("select count(*) from " + schema + ".member_invitations", Long.class))
		    .isEqualTo(2);
		assertThatThrownBy(
		    () -> jdbc.update(
		        "update " + schema
		            + ".member_invitations set status='REQUESTED',reviewed_by=null,reviewed_at=null where id=?",
		        pending))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
		jdbc.execute("drop schema " + schema + " cascade");
	}

	@Test
	void databaseGuardRejectsOverAllocationAndChangingPaidCharge() {
		UUID id = manual("50000");
		assertThatThrownBy(() -> new TransactionTemplate(transactionManager).execute(status -> {
			jdbc.update("update payments set status='CONFIRMED',confirmed_by=?,confirmed_at=now() where id=?", user,
			    id);
			jdbc.update(
			    "insert into payment_allocations(id,property_id,payment_id,charge_id,allocated_amount,status,allocated_by,allocated_at) "
			        + "values (?,?,?,?,60000,'ACTIVE',?,now())",
			    UUID.randomUUID(), property, id, charge, user);
			return null;
		})).isInstanceOf(RuntimeException.class);
		assertThat(count("payment_allocations")).isZero();
		service.confirm(user, property, id, confirm("50000"));
		assertThatThrownBy(
		    () -> billing.cancelCurrentMonthUnits(user, property, List.of(unit), OffsetDateTime.now(clock)))
		    .isInstanceOf(com.moahome.server.billing.exception.BillingException.class);
		assertThatThrownBy(() -> jdbc.update("update charges set status='EXCLUDED_VACANT' where id=?", charge))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
	}

	@Test
	void lateFailureRollsBackPaymentAllocationAndEventTogether() {
		UUID id = manual("50000");
		jdbc.execute(
		    "create function fail_payment_event() returns trigger language plpgsql as $$ begin raise exception 'test failure';end $$");
		jdbc.execute(
		    "create trigger payment_event_failure before insert on payment_events for each row execute function fail_payment_event()");
		assertThatThrownBy(() -> service.confirm(user, property, id, confirm("50000")))
		    .isInstanceOf(RuntimeException.class);
		assertThat(count("payment_allocations")).isZero();
		assertThat(jdbc.queryForObject("select status from payments where id=?", String.class, id))
		    .isEqualTo("PENDING");
	}

	@Test
	void unauthorizedScopeMissingRepresentativeAndNonpositiveChargeAreRejected() {
		UUID id = manual("50000");
		assertThatThrownBy(() -> service.confirm(user, UUID.randomUUID(), id, confirm("50000")))
		    .isInstanceOf(AuthException.class);
		jdbc.update("update charges set total_amount=-500 where id=?", charge);
		assertThat(service.workspace(user, property).charges().stream().filter(c -> c.id().equals(charge)).findFirst()
		    .orElseThrow().amount()).isEqualTo("-500");
		assertThatThrownBy(() -> service.confirm(user, property, id, confirm("1")))
		    .isInstanceOf(PaymentException.class);
		jdbc.update("update unit_residents set is_household_rep=false where unit_id=?", unit);
		assertThatThrownBy(() -> manual("50000")).isInstanceOf(PaymentException.class);
		jdbc.update("update property_members set role='RESIDENT' where property_id=? and user_id=?", property, user);
		assertThatThrownBy(() -> service.workspace(user, property)).isInstanceOf(AuthException.class);
	}

	@Test
	void upgradeKeepsExistingResidentsAccountsAndBillsWithoutCreatingSampleReceipts() {
		String schema = "payment_upgrade_" + UUID.randomUUID().toString().replace("-", "");
		var previous = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
		    .schemas(schema).defaultSchema(schema).target("20261012063902").load();
		previous.migrate();
		for (String table : List.of("users", "properties", "buildings", "units", "bank_accounts", "residents",
		    "unit_residents", "fee_templates", "fee_template_items", "billing_periods", "charges", "charge_items"))
			copyPreviousTable(schema, table);
		List<Map<String, Object>> before = jdbc.queryForList("select * from " + schema + ".charges order by id");
		before.forEach(row -> row.put("charge_type", "MONTHLY"));
		var upgraded = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
		    .schemas(schema).defaultSchema(schema).load();
		int pendingMigrations = upgraded.info().pending().length;
		assertThat(pendingMigrations).isPositive();
		assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(pendingMigrations);
		upgraded.validate();
		assertThat(jdbc.queryForList("select * from " + schema + ".charges order by id")).isEqualTo(before);
		assertThat(jdbc.queryForObject("select count(*) from " + schema + ".residents", Long.class)).isEqualTo(3);
		assertThat(jdbc.queryForObject("select count(*) from " + schema + ".payments", Long.class)).isZero();
		jdbc.execute("drop schema " + schema + " cascade");
	}

	/** 실제 적용된 초기 체크섬에서 업그레이드해도 원본·확정 수납·배분을 그대로 유지해야 합니다. */
	@Test
	void appliedPaymentMigrationUpgradesWithoutChecksumRepairOrReceiptChanges() {
		UUID id = manual("80000");
		service.confirm(user, property, id, confirm("50000"));
		service.importFile(user, property, bank("이대표", "25000"));
		String schema = "applied_payment_" + UUID.randomUUID().toString().replace("-", "");
		var previous = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
		    .schemas(schema).defaultSchema(schema).target("20261015231910").load();
		previous.migrate();
		assertThat(previous.info().current().getChecksum()).isEqualTo(940038749);
		// 초기 함수는 호출 당시 경로를 사용하므로 기존 DB 상태를 재현하는 복사도 같은 스키마에서 수행합니다.
		new TransactionTemplate(transactionManager).execute(status -> {
			jdbc.execute("set local search_path to " + schema + ",public");
			for (String table : List.of("users", "properties", "buildings", "units", "bank_accounts", "residents",
			    "unit_residents", "fee_templates", "fee_template_items", "billing_periods", "charges", "charge_items"))
				copyPreviousTable(schema, table);
			String columns = "id,property_id,bank_account_id,transaction_date,amount,payer_name_encrypted,payer_name_hmac,"
			    + "memo_encrypted,bank_reference,deduplication_key,imported_by,imported_at";
			jdbc.execute("insert into " + schema + ".bank_transactions(" + columns + ") select " + columns
			    + " from public.bank_transactions");
			for (String table : List.of("payments", "payment_allocations", "payment_events")) {
				String previousColumns = jdbc.queryForObject(
				    "select string_agg(quote_ident(column_name),',' order by ordinal_position) from information_schema.columns where table_schema=? and table_name=?",
				    String.class, schema, table);
				jdbc.execute("insert into " + schema + "." + table + "(" + previousColumns + ") select "
				    + previousColumns + " from public." + table);
			}
			return null;
		});
		List<Map<String, Object>> receipts = jdbc.queryForList("select * from " + schema + ".payments order by id");
		receipts.forEach(row -> {
			row.put("deleted_at", null);
			row.put("deleted_by", null);
			row.put("receipt_type", "HOUSEHOLD");
			row.put("income_category_encrypted", null);
			row.put("income_note_encrypted", null);
		});
		List<Map<String, Object>> applied = jdbc
		    .queryForList("select * from " + schema + ".payment_allocations order by id");
		List<Map<String, Object>> originals = jdbc
		    .queryForList("select id,amount,payer_name_encrypted,deduplication_key from " + schema
		        + ".bank_transactions order by id");
		var upgraded = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
		    .schemas(schema).defaultSchema(schema).load();
		int pendingMigrations = upgraded.info().pending().length;
		assertThat(pendingMigrations).isPositive();
		assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(pendingMigrations);
		upgraded.validate();
		receipts.forEach(row -> {
			row.put("auto_match_eligible", true);
			row.put("cash_building_id", null);
			row.put("manual_purpose", "MANUAL".equals(row.get("source_type")) ? "HOUSEHOLD" : null);
		});
		assertThat(jdbc.queryForList("select * from " + schema + ".payments order by id")).isEqualTo(receipts);
		assertThat(jdbc.queryForList("select * from " + schema + ".payment_allocations order by id"))
		    .isEqualTo(applied);
		assertThat(jdbc.queryForList("select id,amount,payer_name_encrypted,deduplication_key from " + schema
		    + ".bank_transactions order by id")).isEqualTo(originals);
		assertThat(jdbc.queryForObject(
		    "select count(*) from " + schema + ".bank_transactions where transaction_time is null and balance is null",
		    Long.class)).isEqualTo(1);
		assertThat(jdbc.queryForList(
		    "select p.proconfig::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
		        + "where n.nspname=? and p.proname in ('validate_payment_allocation','protect_allocated_charge')",
		    String.class, schema)).hasSize(2).allMatch(config -> config.contains(schema));
		assertThatThrownBy(
		    () -> jdbc.update("update " + schema + ".charges set status='EXCLUDED_VACANT' where id=?", charge))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
		jdbc.execute("drop schema " + schema + " cascade");
	}


	/** 은행 원본 없는 등록은 요청 UUID로 멱등 처리하고 지출·배분·작성자를 확정 이력으로 보존합니다. */
	@Test
	void manualExpenseStoresWithoutBankSourceAndRejectsChangedReplay() {
		List<UUID> targets = manualIncomeBuildings();
		var account = bankAccountSettings.read(user, property).accountId();
		var request = manualExpenseRequest(UUID.randomUUID(), account, LocalDate.of(2026, 10, 15), "10000", targets);
		var row = banking.manualExpense(user, property, request).rows().getFirst();
		assertThat(row.id()).isEqualTo(request.id());
		assertThat(row.sourceType()).isEqualTo("MANUAL");
		assertThat(row.date()).isEqualTo(request.date());
		assertThat(row.expense().category()).isEqualTo("공용 청소비");
		assertThat(row.expense().note()).isEqualTo("직접 등록");
		assertThat(row.expense().allocations()).extracting(a -> a.amount()).containsOnly("5000");
		assertThat(row.balance()).isNull();
		assertThat(count("bank_transactions")).isZero();
		assertThat(count("payments")).isZero();
		assertThat(banking.manualExpense(user, property, request).rows()).hasSize(1);
		assertThat(count("expenses")).isEqualTo(1);
		assertThat(count("expense_allocations")).isEqualTo(2);
		assertThatThrownBy(() -> banking.manualExpense(user, property,
		    new BankingRequests.ManualExpense(request.id(), account, request.date(), "12000", request.category(),
		        request.note(), request.mode(), request.allocations())))
		    .isInstanceOf(PaymentException.class).hasMessage("BANK_REQUEST_CONFLICT");
		jdbc.update("update buildings set name='이름 변경',status='INACTIVE' where id=?", targets.getFirst());
		assertThat(banking.manualExpense(user, property, request).rows().getFirst().expense().allocations())
		    .extracting(a -> a.label()).contains("102동");
		assertThatThrownBy(() -> jdbc.update("update expenses set total_amount=1 where id=?", request.id()))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
		assertThatThrownBy(() -> jdbc.update("delete from expense_allocations where expense_id=?", request.id()))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
	}

	/** 과거 수동 출금은 기준일 이전도 등록하고 해당 월에 표시하며 기준 잔고 앞의 잔액은 역산합니다. */
	@Test
	void manualExpenseBalancesUseActualDateAndKeepBankConfirmationSeparate() {
		List<UUID> targets = manualIncomeBuildings();
		var account = bankAccountSettings.read(user, property).accountId();
		cashBalances.saveOpenings(user, property, new BankingBalanceRequests.Opening(LocalDate.of(2026, 9, 30),
		    targets.stream().map(id -> new BankingBalanceRequests.OpeningPart(id, "100000")).toList(), account));
		// 통장 등록일보다 이른 수동 거래도 실제 과거 사용 근거로 조회할 수 있어야 합니다.
		jdbc.update("update bank_accounts set valid_from=date '2026-10-01' where id=?", account);
		jdbc.update("update properties set balance_cutoff_date=date '2026-09-30' where id=?", property);
		banking.manualExpense(user, property,
		    manualExpenseRequest(UUID.randomUUID(), account, LocalDate.of(2026, 9, 15), "2000", targets));
		banking.manualExpense(user, property,
		    manualExpenseRequest(UUID.randomUUID(), account, LocalDate.of(2026, 9, 30), "1000", targets));
		var october = manualExpenseRequest(UUID.randomUUID(), account, LocalDate.of(2026, 10, 15), "10000", targets);
		banking.manualExpense(user, property, october);
		var view = cashBalances.workspace(user, property, "2026-10", account);
		assertThat(view.entries()).hasSize(2).allMatch(e -> e.id().equals(october.id()));
		assertThat(view.buildings()).extracting(b -> b.expense()).containsOnly("5000");
		assertThat(view.buildings()).extracting(b -> b.balance()).containsOnly("95000");
		assertThat(view.accounts().getFirst().calculatedBalance()).isEqualTo("190000");
		assertThat(view.bankBalance()).isNull();
		assertThat(view.accounts().getFirst().balance()).isNull();
		var september = cashBalances.workspace(user, property, "2026-09", account);
		assertThat(september.accountId()).isEqualTo(account);
		assertThat(september.entries()).hasSize(4);
		assertThat(september.buildings()).extracting(b -> b.expense()).containsOnly("1500");
		assertThat(september.buildings()).extracting(b -> b.startBalance()).containsOnly("101500");
		assertThat(september.buildings()).extracting(b -> b.balance()).containsOnly("100000");
	}

	@Test
	void manualExpenseRejectsUnauthorizedFutureClosedForeignAccountAndInvalidAllocationAtomically() {
		List<UUID> targets = manualIncomeBuildings();
		var account = bankAccountSettings.read(user, property).accountId();
		var stranger = users.saveAndFlush(User.create("다른 관리자", null)).getId();
		var request = manualExpenseRequest(UUID.randomUUID(), account, LocalDate.of(2026, 10, 15), "10000", targets);
		assertThatThrownBy(() -> banking.manualExpense(stranger, property, request)).isInstanceOf(AuthException.class);
		var second = addAccount("090", "카카오뱅크", "3333012345678", "예비비");
		bankAccountSettings.close(user, property, second.accountId(), new BankAccountSettings.Close(second.updatedAt()));
		for (var invalid : List.of(
		    manualExpenseRequest(UUID.randomUUID(), UUID.randomUUID(), request.date(), "10000", targets),
		    manualExpenseRequest(UUID.randomUUID(), second.accountId(), request.date(), "10000", targets),
		    manualExpenseRequest(UUID.randomUUID(), account, LocalDate.of(2026, 10, 16), "10000", targets),
		    manualExpenseRequest(UUID.randomUUID(), account, request.date(), "0", targets),
		    manualExpenseRequest(UUID.randomUUID(), account, request.date(), "10001", targets),
		    manualExpenseRequest(UUID.randomUUID(), account, request.date(), "10000", List.of(UUID.randomUUID()))))
			assertThatThrownBy(() -> banking.manualExpense(user, property, invalid)).isInstanceOf(PaymentException.class);
		assertThat(count("expenses")).isZero();
		assertThat(count("expense_allocations")).isZero();
		assertThat(count("bank_transactions")).isZero();
		// 배분 저장 중 DB 오류가 발생해도 지출 머리글만 남기지 않습니다.
		jdbc.execute("create function fail_manual_expense_part() returns trigger language plpgsql as $$ begin raise exception 'test'; end $$");
		jdbc.execute("create trigger fail_manual_part before insert on expense_allocations for each row execute function fail_manual_expense_part()");
		try {
			assertThatThrownBy(() -> banking.manualExpense(user, property, request))
			    .isInstanceOf(org.springframework.dao.DataAccessException.class);
			assertThat(count("expenses")).isZero();
		} finally {
			jdbc.execute("drop function fail_manual_expense_part() cascade");
		}
	}

	/** 동 부담은 동별로, 외부 부담은 정산으로 귀속하고 통장에서는 출금 전액만 한 번 차감합니다. */
	@Test
	void manualExpenseExternalRecoveryUsesSameAccountAndPreservesSourceAbsence() {
		List<UUID> targets = manualIncomeBuildings();
		var account = bankAccountSettings.read(user, property).accountId();
		cashBalances.saveOpenings(user, property, new BankingBalanceRequests.Opening(LocalDate.of(2026, 9, 30),
		    targets.stream().map(id -> new BankingBalanceRequests.OpeningPart(id, "100000")).toList(), account));
		var request = new BankingRequests.ManualExpense(UUID.randomUUID(), account, LocalDate.of(2026, 10, 15),
		    "3000", "전기료", null, "AMOUNT", List.of(new BankingRequests.Allocation(targets.getFirst(), null, "1000", null),
		        new BankingRequests.Allocation(targets.getLast(), null, "1000", null),
		        new BankingRequests.Allocation(null, "외부 관리단", "1000", null)));
		banking.manualExpense(user, property, request);
		var view = cashBalances.workspace(user, property, "2026-10", account);
		assertThat(view.accounts().getFirst().calculatedBalance()).isEqualTo("197000");
		assertThat(view.buildings()).extracting(b -> b.balance()).containsOnly("99000");
		var external = view.externals().getFirst();
		assertThat(external.transactionId()).isNull();
		assertThat(external.remaining()).isEqualTo("1000");
		UUID payment = UUID.randomUUID();
		service.manual(user, property, new PaymentRequests.Manual(payment, null, request.date(), "1000", account,
		    "OTHER", "외부 관리단", "분담금", null, null));
		cashBalances.settle(user, property,
		    new BankingBalanceRequests.Settlement(UUID.randomUUID(), external.id(), payment, "1000"));
		assertThat(cashBalances.workspace(user, property, "2026-10", account).externals().getFirst().remaining())
		    .isEqualTo("0");
		assertThat(count("bank_transactions")).isZero();
	}

	/** 이전 스키마의 활성·삭제 원본과 확정 배분을 복사해 새 컬럼 보정·불변성 유지를 검증합니다. */
	@Test
	void manualExpenseMigrationPreservesImportedExpenseAndAllocationHistory() {
		List<UUID> targets = manualIncomeBuildings();
		var file = csv("거래일,적요,출금액,입금액\n2026-10-15,청소비,6000,0");
		var preview = banking.preview(user, property, file);
		banking.upload(user, property, file, new BankingRequests.Import(List.of(new BankingRequests.Selection(
		    preview.rows().getFirst().id(), null, null, null, new BankingRequests.Expense("청소비", null, "EQUAL", false,
		        targets.stream().map(id -> new BankingRequests.Allocation(id, null, null, null)).toList())))));
		String schema = "manual_expense_" + UUID.randomUUID().toString().replace("-", "");
		var previous = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
		    .schemas(schema).defaultSchema(schema).target("20261018062533").load();
		previous.migrate();
		try {
			new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
				for (String table : List.of("users", "properties", "buildings", "units", "bank_accounts", "bank_transactions",
				    "expenses", "expense_allocations"))
					copyPreviousTable(schema, table);
			});
			jdbc.update("update " + schema + ".bank_transactions set deleted_at=now(),deleted_by=?", user);
			var beforeExpenses = jdbc.queryForList("select id,property_id,bank_transaction_id,category_encrypted,total_amount from "
			    + schema + ".expenses order by id");
			var beforeParts = jdbc.queryForList("select * from " + schema + ".expense_allocations order by id");
			var upgraded = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
			    .schemas(schema).defaultSchema(schema).load();
			upgraded.migrate();
			upgraded.validate();
			assertThat(jdbc.queryForList("select id,property_id,bank_transaction_id,category_encrypted,total_amount from "
			    + schema + ".expenses order by id")).isEqualTo(beforeExpenses);
			assertThat(jdbc.queryForList("select * from " + schema + ".expense_allocations order by id")).isEqualTo(beforeParts);
			assertThat(jdbc.queryForObject("select count(*) from " + schema + ".expenses e join " + schema
			    + ".bank_transactions b on b.id=e.bank_transaction_id where e.bank_account_id=b.bank_account_id"
			    + " and e.expense_date=b.transaction_date and e.source_type='BANK_IMPORT'", Long.class)).isEqualTo(1);
		} finally {
			jdbc.execute("drop schema " + schema + " cascade");
		}
	}

	private BankingRequests.ManualExpense manualExpenseRequest(UUID id, UUID account, LocalDate date, String amount,
	    List<UUID> targets) {
		return new BankingRequests.ManualExpense(id, account, date, amount, "공용 청소비", "직접 등록", "EQUAL",
		    targets.stream().map(target -> new BankingRequests.Allocation(target, null, null, null)).toList());
	}


	/** 빈 종료 통장은 숨기고 사용 이력·종료일로 조회 범위를 판정합니다. */
	@Test
	void closedUnusedAccountIsHiddenEvenInClosingMonthAndStaleSelectionReturnsAll() {
		var unused = addAccount("004", "국민은행", "000111222333", "테스트");
		bankAccountSettings.close(user, property, unused.accountId(), new BankAccountSettings.Close(unused.updatedAt()));
		var metadata = banking.workspace(user, property).accounts().stream()
		    .filter(a -> unused.accountId().equals(a.id())).findFirst().orElseThrow();
		assertThat(metadata.hasHistory()).isFalse();
		assertThat(metadata.closedOn()).isEqualTo(LocalDate.of(2026, 10, 15));
		var view = cashBalances.workspace(user, property, "2026-10", unused.accountId());
		assertThat(view.accountId()).isNull();
		assertThat(view.accounts()).noneMatch(a -> a.id().equals(unused.accountId()));
		assertThat(bankAccountSettings.detail(user, property, unused.accountId()).status()).isEqualTo("CLOSED");
	}

	/** 초기 잔고만 등록한 계좌는 입출금 사용 이력이 아니므로 생성 전 월과 빈 종료 월 모두 숨깁니다. */
	@Test
	void openingOnlyClosedAccountDoesNotBecomeVisibleBeforeCreationOrInClosingMonth() {
		List<UUID> targets = manualIncomeBuildings();
		var saved = addAccount("004", "국민은행", "000111222333", "정리된 통장");
		var account = saved.accountId();
		closedAccountOpenings(account, targets, "0", "0");
		cashBalances.saveAccountOpening(user, property, new BankingBalanceRequests.AccountOpening(UUID.randomUUID(),
		    account, LocalDate.of(2026, 9, 30), "0", 0L));
		bankAccountSettings.close(user, property, account, new BankAccountSettings.Close(saved.updatedAt()));
		assertThat(cashBalances.workspace(user, property, "2026-10").accounts()).noneMatch(a -> account.equals(a.id()));
		assertThat(cashBalances.workspace(user, property, "2026-11").accounts()).noneMatch(a -> account.equals(a.id()));
		assertThat(cashBalances.workspace(user, property, "2026-09", account).accountId()).isNull();
		assertThat(cashBalances.workspace(user, property, "2026-08", account).accountId()).isNull();
		var meta = banking.workspace(user, property).accounts().stream().filter(a -> account.equals(a.id())).findFirst().orElseThrow();
		assertThat(meta.availableFrom()).isEqualTo(LocalDate.of(2026, 10, 15));
		assertThat(meta.hasHistory()).isFalse();
		assertThat(jdbc.queryForObject("select count(*) from building_cash_openings where bank_account_id=?", Long.class, account))
		    .isEqualTo(2);
	}

	/** 초기 금액만 있는 빈 종료 계좌는 숨기고 실제 입출금 이후 확인 불가 잔액은 보존합니다. */
	@Test
	void openingOnlyClosedAccountsAreHiddenButUsedAccountWithUnknownBalanceRemains() {
		List<UUID> targets = manualIncomeBuildings();
		var remaining = addAccount("004", "국민은행", "000111222333", "잔액 있음");
		closedAccountOpenings(remaining.accountId(), targets, "50000", "0");
		bankAccountSettings.close(user, property, remaining.accountId(), new BankAccountSettings.Close(remaining.updatedAt()));
		var offset = addAccount("088", "신한은행", "000111222444", "동별 상계");
		closedAccountOpenings(offset.accountId(), targets, "100", "-100");
		cashBalances.saveAccountOpening(user, property, new BankingBalanceRequests.AccountOpening(UUID.randomUUID(),
		    offset.accountId(), LocalDate.of(2026, 9, 30), "0", 0L));
		bankAccountSettings.close(user, property, offset.accountId(), new BankAccountSettings.Close(offset.updatedAt()));
		var unknown = addAccount("020", "우리은행", "000111222555", "확인 필요");
		service.manual(user, property, new PaymentRequests.Manual(UUID.randomUUID(), null, LocalDate.of(2026, 10, 15),
		    "1000", unknown.accountId(), "OTHER", "관리단", "기타 입금", null, null));
		bankAccountSettings.close(user, property, unknown.accountId(), new BankAccountSettings.Close(unknown.updatedAt()));
		assertThat(cashBalances.workspace(user, property, "2026-11").accounts()).extracting(a -> a.id())
		    .contains(unknown.accountId()).doesNotContain(remaining.accountId(), offset.accountId());
	}

	/** 잔액 0원이라도 외부 미회수금이 있으면 남기고 회수가 완료된 다음 조회부터 숨깁니다. */
	@Test
	void closedZeroBalanceAccountRemainsUntilExternalRecoveryFinishes() {
		List<UUID> targets = manualIncomeBuildings();
		var saved = addAccount("004", "국민은행", "000111222333", "외부 정산");
		var account = saved.accountId();
		closedAccountOpenings(account, targets, "0", "0");
		cashBalances.saveAccountOpening(user, property, new BankingBalanceRequests.AccountOpening(UUID.randomUUID(),
		    account, LocalDate.of(2026, 9, 30), "0", 0L));
		banking.manualExpense(user, property, new BankingRequests.ManualExpense(UUID.randomUUID(), account,
		    LocalDate.of(2026, 10, 15), "1000", "외부 비용", null, "AMOUNT",
		    List.of(new BankingRequests.Allocation(null, "외부 관리단", "1000", null))));
		UUID income = UUID.randomUUID();
		service.manual(user, property, new PaymentRequests.Manual(income, null, LocalDate.of(2026, 10, 15), "1000",
		    account, "OTHER", "외부 관리단", "분담금", null, null));
		bankAccountSettings.close(user, property, account, new BankAccountSettings.Close(saved.updatedAt()));
		var before = cashBalances.workspace(user, property, "2026-11", account);
		assertThat(before.accountId()).isEqualTo(account);
		assertThat(before.accounts().stream().filter(a -> account.equals(a.id())).findFirst().orElseThrow().calculatedBalance())
		    .isEqualTo("0");
		var external = before.externals().getFirst();
		cashBalances.settle(user, property, new BankingBalanceRequests.Settlement(UUID.randomUUID(), external.id(), income, "1000"));
		var after = cashBalances.workspace(user, property, "2026-11", account);
		assertThat(after.accountId()).isNull();
		assertThat(after.accounts()).noneMatch(a -> account.equals(a.id()));
	}

	private void closedAccountOpenings(UUID account, List<UUID> targets, String first, String second) {
		cashBalances.saveOpenings(user, property, new BankingBalanceRequests.Opening(LocalDate.of(2026, 9, 30), List.of(
		    new BankingBalanceRequests.OpeningPart(targets.getFirst(), first),
		    new BankingBalanceRequests.OpeningPart(targets.getLast(), second)), account));
	}

	@TestConfiguration
	static class TestBeans {
		@Bean
		MutableClock clock() {
			return new MutableClock(Instant.now());
		}

		@Bean
		ObjectMapper mapper() {
			return JsonMapper.builder().build();
		}

		@Bean
		Validator validator() {
			return Validation.buildDefaultValidatorFactory().getValidator();
		}

		@Bean
		AccountNumberSecurity accountSecurity() {
			return new AccountNumberSecurity(RegistrationTestKeys.accountProperties());
		}

		@Bean
		PhoneSecurity phoneSecurity() {
			byte[] encryption = new byte[32], hmac = new byte[32];
			var random = new java.security.SecureRandom();
			random.nextBytes(encryption);
			random.nextBytes(hmac);
			return new PhoneSecurity(new com.moahome.server.config.PhoneSecurityProperties("v1",
			    Map.of("v1", Base64.getEncoder().encodeToString(encryption)),
			    Base64.getEncoder().encodeToString(hmac)));
		}

		@Bean
		PaymentTextSecurity paymentSecurity() {
			return new PaymentTextSecurity(RegistrationTestKeys.accountProperties());
		}

		@Bean
		RegistrationFingerprint fingerprints(ObjectMapper mapper) {
			return new RegistrationFingerprint(RegistrationTestKeys.fingerprintProperties(), mapper);
		}
	}

	/** 적용 전 스키마의 컬럼만 복사해 후속 Migration으로 추가된 감사 컬럼을 미리 주입하지 않습니다. */
	private void copyPreviousTable(String schema, String table) {
		String columns = jdbc.queryForObject(
		    "select string_agg(quote_ident(column_name),',' order by ordinal_position) from information_schema.columns where table_schema=? and table_name=?",
		    String.class, schema, table);
		jdbc.execute(
		    "insert into " + schema + "." + table + "(" + columns + ") select " + columns + " from public." + table);
	}

	/** 취소된 수동 수납은 원래 취소 상태·사유·충당 이력을 보존하고 삭제 감사만 한 번 추가합니다. */
	@Test
	void canceledUnlinkedManualReceiptCanBeDeletedWithBankTransactionsWithoutLosingHistory() {
		UUID manual = manual("5000");
		service.confirm(user, property, manual, new PaymentRequests.Confirm(unit, null, null));
		service.cancel(user, property, manual, "오입력 정정");
		String reason = jdbc.queryForObject("select cancel_reason_encrypted from payments where id=?", String.class,
		    manual);
		var imported = service.importFile(user, property, bank("미확인입금", "6000")).payments().stream()
		    .filter(p -> "BANK_IMPORT".equals(p.source())).findFirst().orElseThrow();
		UUID original = imported.bankTransactionId();
		var selected = new com.moahome.server.banking.dto.BankingRequests.DeleteMany(List.of(original),
		    List.of(manual));
		banking.deleteMany(user, property, selected);
		banking.deleteMany(user, property, selected);
		assertThat(service.workspace(user, property).payments())
		    .noneMatch(p -> p.id().equals(manual) || p.id().equals(imported.id()));
		assertThat(jdbc.queryForObject("select status from payments where id=?", String.class, manual))
		    .isEqualTo("CANCELED");
		assertThat(jdbc.queryForObject("select cancel_reason_encrypted from payments where id=?", String.class, manual))
		    .isEqualTo(reason);
		assertThat(jdbc.queryForObject("select deleted_by from payments where id=?", UUID.class, manual))
		    .isEqualTo(user);
		assertThat(jdbc.queryForObject("select count(*) from payment_events where payment_id=? and action='DELETED'",
		    Long.class, manual)).isEqualTo(1);
		assertThat(jdbc.queryForObject("select count(*) from payment_events where payment_id=? and action='CANCELED'",
		    Long.class, manual)).isEqualTo(1);
		assertThat(jdbc.queryForObject(
		    "select count(*) from payment_allocations where payment_id=? and status='ACTIVE'", Long.class, manual))
		    .isZero();
		assertThat(jdbc.queryForObject("select deleted_at is not null from bank_transactions where id=?", Boolean.class,
		    original)).isTrue();
	}

	/** 확정 수동 입금은 충당·선입금과 함께 제외하며 잘못 섞은 은행 수납 ID는 전체를 롤백합니다. */
	@Test
	void mixedBankDeletionCancelsConfirmedManualAndRejectsBankReceiptIdsAtomically() {
		UUID manual = manual("150000");
		service.confirm(user, property, manual, new PaymentRequests.Confirm(unit, null, null));
		assertThat(jdbc.queryForObject(
		    "select count(*) from payment_allocations where payment_id=? and status='ACTIVE'", Long.class, manual))
		    .isPositive();
		var imported = service.importFile(user, property, bank("미확인입금", "6000")).payments().stream()
		    .filter(p -> "BANK_IMPORT".equals(p.source())).findFirst().orElseThrow();
		UUID original = imported.bankTransactionId();
		assertThatThrownBy(() -> banking.deleteMany(user, property,
		    new com.moahome.server.banking.dto.BankingRequests.DeleteMany(List.of(original),
		        List.of(manual, imported.id()))))
		    .isInstanceOf(PaymentException.class).extracting(e -> ((PaymentException) e).code())
		    .isEqualTo("PAYMENT_DELETE_NOT_ALLOWED");
		assertThat(
		    jdbc.queryForObject("select deleted_at is null from bank_transactions where id=?", Boolean.class, original))
		    .isTrue();
		assertThat(jdbc.queryForObject("select deleted_at is null from payments where id=?", Boolean.class, manual))
		    .isTrue();
		assertThat(jdbc.queryForObject("select status from payments where id=?", String.class, manual))
		    .isEqualTo("CONFIRMED");

		var selected = new com.moahome.server.banking.dto.BankingRequests.DeleteMany(List.of(original),
		    List.of(manual));
		banking.deleteMany(user, property, selected);
		banking.deleteMany(user, property, selected);
		assertThat(service.workspace(user, property).payments())
		    .noneMatch(p -> p.id().equals(manual) || p.id().equals(imported.id()));
		assertThat(jdbc.queryForObject("select status from payments where id=?", String.class, manual))
		    .isEqualTo("CANCELED");
		assertThat(jdbc.queryForObject(
		    "select count(*) from payment_allocations where payment_id=? and status='ACTIVE'", Long.class, manual))
		    .isZero();
		assertThat(jdbc.queryForObject("select count(*) from payment_events where payment_id=? and action='CANCELED'",
		    Long.class, manual)).isEqualTo(1);
		assertThat(jdbc.queryForObject("select count(*) from payment_events where payment_id=? and action='DELETED'",
		    Long.class, manual)).isEqualTo(1);
		assertThat(jdbc.queryForObject("select deleted_by from payments where id=?", UUID.class, manual))
		    .isEqualTo(user);
		assertThat(jdbc.queryForObject("select deleted_at is not null from bank_transactions where id=?", Boolean.class,
		    original)).isTrue();
	}

	/** 계좌 수·용도를 고정하지 않고 같은 은행의 여러 통장과 자유 별칭·앞자리 0을 보존합니다. */
	@Test
	void managesDynamicAccountsAndPreservesHistoryWhenPrimaryChangesAndCloses() {
		var first = bankAccountSettings.read(user, property);
		UUID manual = manual("5000");
		var second = addAccount("090", "카카오뱅크", "000123456789", "공사비 임시 보관");
		for (int index = 0; index < 4; index++)
			addAccount("090", "카카오뱅크", "00012345678" + index, "자유 용도 " + index);
		assertThat(bankAccountSettings.list(user, property)).hasSize(6).filteredOn(a -> a.isPrimary()).hasSize(1);
		assertThat(second.accountNumber()).isEqualTo("000123456789");
		var promote = new com.moahome.server.banking.dto.BankAccountSettings.Save(second.accountId(),
		    second.updatedAt(), second.bankCode(), second.bankName(), second.accountNumber(), second.holderName(),
		    second.alias(), true, first.accountId());
		var primary = bankAccountSettings.save(user, property, promote);
		assertThat(primary.isPrimary()).isTrue();
		assertThat(bankAccountSettings.save(user, property, promote)).isEqualTo(primary);
		assertThat(jdbc.queryForObject("select bank_account_id from payments where id=?", UUID.class, manual))
		    .isEqualTo(first.accountId());
		assertThatThrownBy(() -> bankAccountSettings.close(user, property, primary.accountId(),
		    new com.moahome.server.banking.dto.BankAccountSettings.Close(primary.updatedAt()))).isInstanceOfSatisfying(
		        PaymentException.class, e -> assertThat(e.code()).isEqualTo("BANK_ACCOUNT_PRIMARY_REQUIRED"));
		var old = bankAccountSettings.list(user, property).stream().filter(a -> a.accountId().equals(first.accountId()))
		    .findFirst().orElseThrow();
		var closed = bankAccountSettings.close(user, property, old.accountId(),
		    new com.moahome.server.banking.dto.BankAccountSettings.Close(old.updatedAt()));
		assertThat(closed.status()).isEqualTo("CLOSED");
		assertThat(bankAccountSettings.list(user, property)).hasSize(6);
		assertThat(service.workspace(user, property).payments())
		    .anyMatch(p -> p.id().equals(manual) && p.accountId().equals(old.accountId()));
		assertThatThrownBy(() -> banking.preview(user, property, bank("김대표", "5000"), old.accountId()))
		    .isInstanceOf(PaymentException.class);
		assertThatThrownBy(() -> bankAccountSettings.save(user, property,
		    new com.moahome.server.banking.dto.BankAccountSettings.Save(UUID.randomUUID(), null, "090", "카카오뱅크",
		        second.accountNumber(), "예시", null, false, primary.accountId())))
		    .isInstanceOfSatisfying(PaymentException.class,
		        e -> assertThat(e.code()).isEqualTo("BANK_ACCOUNT_DUPLICATE"));
	}

	/** 같은 시각에 등록한 통장도 초기 입력 순서를 보존하고 기본 전환·이름 정정 뒤에도 모든 조회 순서가 같습니다. */
	@Test
	void accountRegistrationOrderIsPreservedAcrossSettingsPaymentsTransactionsAndBalances() {
		var draft = RegistrationFixtures.request(UUID.randomUUID(), false);
		var input = new com.moahome.server.property.dto.PropertyRegistrationRequest(draft.requestId(),
		    draft.basicInfo(), draft.buildings(), draft.units(),
		    List.of(
		        new com.moahome.server.property.dto.PropertyRegistrationRequest.BankAccountInput("088", "신한은행",
		            "111122223333", "관리단", false),
		        new com.moahome.server.property.dto.PropertyRegistrationRequest.BankAccountInput("090", "카카오뱅크",
		            "444455556666", "관리단", true)),
		    draft.feeItems());
		var target = registration.register(user, input).response().property().id();
		List<BankAccountSettings.Response> initial = bankAccountSettings.list(user, target);
		assertThat(initial).extracting(a -> a.bankName()).containsExactly("신한은행", "카카오뱅크");
		var primary = initial.getLast();
		var third = bankAccountSettings.save(user, target, new com.moahome.server.banking.dto.BankAccountSettings.Save(
		    UUID.randomUUID(), null, "020", "우리은행", "777788889999", "관리단", "새 통장", true, primary.accountId()));
		List<UUID> expected = List.of(initial.getFirst().accountId(), primary.accountId(), third.accountId());
		assertThat(bankAccountSettings.list(user, target)).extracting(a -> a.accountId())
		    .containsExactlyElementsOf(expected);
		assertThat(service.workspace(user, target).accounts()).extracting(a -> a.id())
		    .containsExactlyElementsOf(expected);
		assertThat(banking.workspace(user, target).accounts()).extracting(a -> a.id())
		    .containsExactlyElementsOf(expected);
		assertThat(cashBalances.workspace(user, target, "2026-10").accounts()).extracting(a -> a.id())
		    .containsExactlyElementsOf(expected);
		var second = bankAccountSettings.list(user, target).get(1);
		bankAccountSettings.close(user, target, second.accountId(),
		    new com.moahome.server.banking.dto.BankAccountSettings.Close(second.updatedAt()));
		assertThat(bankAccountSettings.list(user, target)).extracting(a -> a.accountId())
		    .containsExactlyElementsOf(expected);
		assertThat(jdbc.queryForList(
		    "select registration_order from bank_accounts where property_id=? order by registration_order",
		    Integer.class, target)).containsExactly(0, 1, 2);
	}

	/** 같은 생성 ID 재시도는 중복 저장하지 않고 다른 대상·오래된 버전·다른 관리자의 기본 전환은 거부합니다. */
	@Test
	void accountWritesAreIdempotentAndRejectStaleOrForeignRequests() {
		var primary = bankAccountSettings.read(user, property);
		UUID id = UUID.randomUUID();
		var request = new com.moahome.server.banking.dto.BankAccountSettings.Save(id, null, "090", "카카오뱅크",
		    "00011112222", "관리단", "예비", false, primary.accountId());
		var account = bankAccountSettings.save(user, property, request);
		assertThat(bankAccountSettings.save(user, property, request)).isEqualTo(account);
		var renamed = bankAccountSettings.save(user, property,
		    new com.moahome.server.banking.dto.BankAccountSettings.Save(id, account.updatedAt(), account.bankCode(),
		        account.bankName(), account.accountNumber(), account.holderName(), "변경한 별칭", false,
		        primary.accountId()));
		assertThatThrownBy(() -> bankAccountSettings.save(user, property,
		    new com.moahome.server.banking.dto.BankAccountSettings.Save(id, account.updatedAt(), account.bankCode(),
		        account.bankName(), account.accountNumber(), account.holderName(), "오래된 변경", false,
		        primary.accountId())))
		    .isInstanceOfSatisfying(PaymentException.class,
		        e -> assertThat(e.code()).isEqualTo("BANK_ACCOUNT_CONFLICT"));
		bankAccountSettings.save(user, property,
		    new com.moahome.server.banking.dto.BankAccountSettings.Save(id, renamed.updatedAt(), renamed.bankCode(),
		        renamed.bankName(), renamed.accountNumber(), renamed.holderName(), renamed.alias(), true,
		        primary.accountId()));
		assertThatThrownBy(() -> bankAccountSettings.save(user, property,
		    new com.moahome.server.banking.dto.BankAccountSettings.Save(UUID.randomUUID(), null, "004", "국민은행",
		        "00033334444", "관리단", null, true, primary.accountId())))
		    .isInstanceOfSatisfying(PaymentException.class,
		        e -> assertThat(e.code()).isEqualTo("BANK_ACCOUNT_CONFLICT"));
		var other = registration.register(user, RegistrationFixtures.request(UUID.randomUUID(), false)).response()
		    .property().id();
		assertThatThrownBy(() -> banking.preview(user, other, bank("김대표", "5000"), id))
		    .isInstanceOf(PaymentException.class);
		assertThatThrownBy(() -> bankAccountSettings.save(user, other,
		    new com.moahome.server.banking.dto.BankAccountSettings.Save(id, renamed.updatedAt(), renamed.bankCode(),
		        renamed.bankName(), renamed.accountNumber(), renamed.holderName(), renamed.alias(), false,
		        bankAccountSettings.read(user, other).accountId())))
		    .isInstanceOf(PaymentException.class);
		jdbc.update("update property_members set role='MANAGER' where property_id=? and user_id=?", property, user);
		assertThatThrownBy(() -> bankAccountSettings.list(user, property)).isInstanceOf(AuthException.class);
		assertThatThrownBy(() -> bankAccountSettings.save(user, property, request)).isInstanceOf(AuthException.class);
	}

	/** 같은 파일도 통장별로 중복을 판정하며 세대 수납과 동별 보유금은 전체 통장에서 한 번씩 합산합니다. */
	@Test
	void importsIdenticalRowsIndependentlyPerAccountAndCombinesHouseholdAndBuildingCash() {
		UUID building = UUID.randomUUID();
		jdbc.update(
		    "insert into buildings(id,property_id,name,sort_order,status,created_at,updated_at) values (?,?,?,0,'ACTIVE',now(),now())",
		    building, property, "102동");
		jdbc.update("update units set building_id=? where id=?", building, unit);
		cashBalances.saveOpenings(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.Opening(LocalDate.of(2026, 10, 1),
		        List.of(new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(building, "0"))));
		var first = bankAccountSettings.read(user, property);
		var second = addAccount("090", "카카오뱅크", "000123456789", "자유 통장");
		var source = csv("거래일시,적요,출금액,입금액,잔액\n2026-10-15 08:00:00,김대표,0,30000,100000");
		for (UUID account : List.of(first.accountId(), second.accountId())) {
			var file = account.equals(second.accountId()) ? kakaoFile(source) : source;
			var preview = banking.preview(user, property, file, account);
			assertThat(preview.rows()).hasSize(1).allMatch(row -> row.accountId().equals(account));
			banking.upload(user, property, file,
			    new com.moahome.server.banking.dto.BankingRequests.Import(preview.rows().stream().map(
			        r -> new com.moahome.server.banking.dto.BankingRequests.Selection(r.id(), unit, null, null, null))
			        .toList(), account));
			assertThat(banking.preview(user, property, file, account).duplicateCount()).isEqualTo(1);
		}
		assertThat(
		    jdbc.queryForObject("select count(*) from bank_transactions where property_id=?", Long.class, property))
		    .isEqualTo(2);
		assertThat(service.workspace(user, property).payments()).hasSize(2)
		    .allMatch(p -> p.status().equals("CONFIRMED"));
		var balances = cashBalances.workspace(user, property, "2026-10");
		assertThat(balances.accounts()).hasSize(2).allMatch(a -> a.balance().equals("100000"));
		assertThat(balances.bankBalance()).isEqualTo("200000");
		assertThat(balances.buildings()).singleElement().satisfies(b -> {
			assertThat(b.income()).isEqualTo("60000");
			assertThat(b.balance()).isEqualTo("60000");
		});
		UUID manual = UUID.randomUUID();
		service.manual(user, property,
		    new PaymentRequests.Manual(manual, unit, LocalDate.of(2026, 10, 15), "7000", second.accountId()));
		assertThat(jdbc.queryForObject("select bank_account_id from payments where id=?", UUID.class, manual))
		    .isEqualTo(second.accountId());
		assertThat(cashBalances.workspace(user, property, "2026-10").buildings().getFirst().income())
		    .isEqualTo("60000");
	}

	/** 새 통장·잔액 미제공 거래는 전체 은행 합계를 미확인으로 두고 다른 계좌의 예전 잔액으로 숨기지 않습니다. */
	@Test
	void unknownAccountBalanceNeverBecomesZeroOrReusesAnotherAccountsBalance() {
		var first = bankAccountSettings.read(user, property);
		var file = csv("거래일시,적요,출금액,입금액,잔액\n2026-10-15 08:00:00,김대표,0,30000,100000");
		var preview = banking.preview(user, property, file, first.accountId());
		banking.upload(user, property, file,
		    new com.moahome.server.banking.dto.BankingRequests.Import(preview.rows().stream()
		        .map(r -> new com.moahome.server.banking.dto.BankingRequests.Selection(r.id(), unit, null, null, null))
		        .toList(), first.accountId()));
		var second = addAccount("090", "카카오뱅크", "000123456789", null);
		var balances = cashBalances.workspace(user, property, "2026-10");
		assertThat(balances.bankBalance()).isNull();
		assertThat(balances.accounts()).hasSize(2)
		    .anyMatch(a -> a.id().equals(second.accountId()) && a.balance() == null);
	}

	/** 이체는 명단 이름과 같아도 자동 수납하지 않으며 원본·연결·취소·재연결 이력만 보존합니다. */
	@Test
	void internalTransfersPreserveRawBalancesWithoutCreatingPaymentsOrExpenses() {
		var first = bankAccountSettings.read(user, property);
		var second = addAccount("090", "카카오뱅크", "000123456789", "옮긴 통장");
		var outgoing = transferFile(first.accountId(), "EXPENSE", "10000", "90000");
		var incoming = transferFile(second.accountId(), "INCOME", "10000", "110000");
		assertThat(count("payments")).isZero();
		assertThat(count("expenses")).isZero();
		var before = cashBalances.workspace(user, property, "2026-10");
		var request = new com.moahome.server.banking.dto.BankingRequests.Transfer(UUID.randomUUID(), outgoing,
		    incoming);
		var linked = banking.connectTransfer(user, property, request);
		assertThat(linked.rows()).hasSize(2)
		    .allMatch(r -> r.status().equals("TRANSFER") && r.transferId().equals(request.id()));
		banking.connectTransfer(user, property, request);
		assertThat(count("bank_transfers")).isEqualTo(1);
		var after = cashBalances.workspace(user, property, "2026-10");
		assertThat(after.bankBalance()).isEqualTo("200000").isEqualTo(before.bankBalance());
		assertThat(after.buildings()).isEqualTo(before.buildings());
		assertThat(after.pending()).isEmpty();
		assertThatThrownBy(() -> banking.confirmExpense(user, property, outgoing,
		    new com.moahome.server.banking.dto.BankingRequests.Expense("이체", null, "AMOUNT", false,
		        List.of(new com.moahome.server.banking.dto.BankingRequests.Allocation(null, "외부", "10000", null)))))
		    .isInstanceOfSatisfying(PaymentException.class,
		        e -> assertThat(e.code()).isEqualTo("BANK_TRANSFER_CONFLICT"));
		assertThatThrownBy(() -> banking.deleteMany(user, property,
		    new com.moahome.server.banking.dto.BankingRequests.DeleteMany(List.of(outgoing)))).isInstanceOfSatisfying(
		        PaymentException.class, e -> assertThat(e.code()).isEqualTo("BANK_TRANSFER_DELETE_PAIR_REQUIRED"));
		assertThatThrownBy(() -> jdbc.update("update bank_transactions set amount=9999 where id=?", outgoing))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
		banking.cancelTransfer(user, property, request.id());
		banking.cancelTransfer(user, property, request.id());
		assertThat(banking.workspace(user, property).rows()).allMatch(r -> r.status().equals("TRANSFER_PENDING"));
		assertThat(cashBalances.workspace(user, property, "2026-10").pending()).hasSize(2);
		var relink = new com.moahome.server.banking.dto.BankingRequests.Transfer(UUID.randomUUID(), outgoing, incoming);
		banking.connectTransfer(user, property, relink);
		banking.deleteMany(user, property,
		    new com.moahome.server.banking.dto.BankingRequests.DeleteMany(List.of(outgoing, incoming)));
		assertThat(banking.workspace(user, property).rows()).isEmpty();
		assertThat(count("bank_transfers")).isEqualTo(2);
		assertThat(count("payments")).isZero();
		assertThat(count("expenses")).isZero();
	}

	/** 같은 통장·다른 금액의 이체 연결을 거부하고 분류 실패 시 선택 전체를 롤백합니다. */
	@Test
	void rejectsInvalidTransferSourcesAndRollsBackNonprimaryUploads() {
		var first = bankAccountSettings.read(user, property);
		var second = addAccount("090", "카카오뱅크", "000123456789", null);
		var outgoing = transferFile(first.accountId(), "EXPENSE", "10000", "90000");
		var sameAccount = transferFile(first.accountId(), "INCOME", "10000", "100000");
		var wrongAmount = transferFile(second.accountId(), "INCOME", "20000", "20000");
		for (UUID incoming : List.of(sameAccount, wrongAmount))
			assertThatThrownBy(() -> banking.connectTransfer(user, property,
			    new com.moahome.server.banking.dto.BankingRequests.Transfer(UUID.randomUUID(), outgoing, incoming)))
			    .isInstanceOf(PaymentException.class);
		long sources = count("bank_transactions");
		var file = kakaoFile(csv(
		    "거래일시,적요,출금액,입금액,잔액\n2026-10-15 10:00:00,김대표,0,5000,25000\n2026-10-15 11:00:00,청소,10000,0,15000"));
		var preview = banking.preview(user, property, file, second.accountId());
		var invalid = new com.moahome.server.banking.dto.BankingRequests.Expense("청소", null, "AMOUNT", false,
		    List.of(new com.moahome.server.banking.dto.BankingRequests.Allocation(null, "외부", "9999", null)));
		assertThatThrownBy(() -> banking.upload(user, property, file,
		    new com.moahome.server.banking.dto.BankingRequests.Import(preview.rows().stream()
		        .map(r -> new com.moahome.server.banking.dto.BankingRequests.Selection(r.id(), null, null, null,
		            r.direction().equals("EXPENSE") ? invalid : null))
		        .toList(), second.accountId())))
		    .isInstanceOf(PaymentException.class);
		assertThat(count("bank_transactions")).isEqualTo(sources);
		assertThat(count("payments")).isZero();
	}

	private com.moahome.server.banking.dto.BankAccountSettings.Response addAccount(String code, String name,
	    String number, String alias) {
		var primary = bankAccountSettings.read(user, property);
		return bankAccountSettings.save(user, property, new com.moahome.server.banking.dto.BankAccountSettings.Save(
		    UUID.randomUUID(), null, code, name, number, "관리단", alias, false, primary.accountId()));
	}

	private UUID transferFile(UUID account, String direction, String amount, String balance) {
		var file = csv("거래일시,적요,출금액,입금액,잔액\n2026-10-15 09:00:00,김대표,"
		    + (direction.equals("EXPENSE") ? amount + ",0" : "0," + amount) + "," + balance);
		if (bankAccountSettings.list(user, property).stream().anyMatch(a -> a.accountId().equals(account) && a.bankCode().equals("090")))
			file = kakaoFile(file);
		var preview = banking.preview(user, property, file, account);
		var saved = banking.upload(user, property, file,
		    new com.moahome.server.banking.dto.BankingRequests.Import(
		        preview.rows().stream().map(r -> new com.moahome.server.banking.dto.BankingRequests.Selection(r.id(),
		            null, null, null, null, null, true)).toList(),
		        account));
		return saved.rows().stream()
		    .filter(r -> r.accountId().equals(account) && r.direction().equals(direction) && r.amount().equals(amount))
		    .findFirst().orElseThrow().id();
	}

	/** 세대 없이 기타 입금을 확정하며 원본·관리비 충당을 만들지 않고 요청 내용까지 재시도 검증합니다. */
	@Test
	void manualOtherIncomeDoesNotRequireHouseholdAndReplaysWithoutDuplicate() {
		UUID id = UUID.randomUUID();
		var request = new PaymentRequests.Manual(id, null, LocalDate.of(2026, 10, 15), "12000", null, "OTHER", "외부 관리단",
		    "수리비", null, null);
		var result = service.manual(user, property, request);
		var saved = result.payments().getFirst();
		assertThat(saved.receiptType()).isEqualTo("OTHER");
		assertThat(saved.status()).isEqualTo("CONFIRMED");
		assertThat(saved.unitId()).isEmpty();
		assertThat(saved.payer()).isEqualTo("외부 관리단");
		assertThat(saved.incomeCategory()).isEqualTo("수리비");
		assertThat(saved.allocations()).isEmpty();
		assertThat(saved.incomeAllocation()).isNull();
		assertThat(saved.bankTransactionId()).isNull();
		assertThat(count("bank_transactions")).isZero();
		assertThat(count("payment_allocations")).isZero();
		assertThat(service.manual(user, property, request).payments()).hasSize(1);
		assertThat(cashBalances.workspace(user, property, "2026-10").incomes()).singleElement().satisfies(i -> {
			assertThat(i.id()).isEqualTo(id);
			assertThat(i.kind()).isEqualTo("OTHER");
			assertThat(i.available()).isEqualTo("12000");
		});
		assertThatThrownBy(() -> service.manual(user, property,
		    new PaymentRequests.Manual(id, null, request.date(), "12000", null, "OTHER", "다른 입금자", "수리비", null, null)))
		    .isInstanceOfSatisfying(PaymentException.class,
		        e -> assertThat(e.code()).isEqualTo("PAYMENT_REQUEST_CONFLICT"));
		service.cancel(user, property, id, "잘못 입력");
		assertThat(cashBalances.workspace(user, property, "2026-10").incomes()).isEmpty();
	}

	/** 수동 등록에는 자동 매칭 용도를 제공하지 않으며 각 용도의 세대·입금자·항목 모양을 서버에서도 제한합니다. */
	@Test
	void manualIncomeRejectsWrongPurposeFieldsWithoutSaving() {
		var date = LocalDate.of(2026, 10, 15);
		for (var request : List.of(
		    new PaymentRequests.Manual(UUID.randomUUID(), null, date, "1000", null, "HOUSEHOLD", null, null, null,
		        null),
		    new PaymentRequests.Manual(UUID.randomUUID(), unit, date, "1000", null, "OTHER", "외부", "분담금", null, null),
		    new PaymentRequests.Manual(UUID.randomUUID(), null, date, "1000", null, "OTHER", null, "분담금", null, null),
		    new PaymentRequests.Manual(UUID.randomUUID(), null, date, "1000", null, "OTHER", "외부", null, null, null),
		    new PaymentRequests.Manual(UUID.randomUUID(), null, date, "1000", null, "SHARED", "은행", "이자", null, null),
		    new PaymentRequests.Manual(UUID.randomUUID(), null, date, "1000", null, "AUTO", "김대표", null, null, null)))
			assertThatThrownBy(() -> service.manual(user, property, request)).isInstanceOf(PaymentException.class);
		assertThat(count("payments")).isZero();
	}

	/** 균등·비율·직접 금액 모두 입금 전액만 귀속하며 취소 시 동별 보유금에서 제외하고 배분 이력은 보존합니다. */
	@Test
	void manualSharedIncomeSupportsAllAllocationModesAndCancel() {
		List<UUID> targets = manualIncomeBuildings();
		var baseline = cashBalances.workspace(user, property, "2026-10").bankBalance();
		for (String mode : List.of("EQUAL", "RATIO", "AMOUNT")) {
			var split = manualIncomeSplit(targets, mode, "250", "750");
			UUID id = UUID.randomUUID();
			var request = new PaymentRequests.Manual(id, null, LocalDate.of(2026, 10, 15), "1000", null, "SHARED", "은행",
			    "예금이자", null, split);
			var saved = service.manual(user, property, request).payments().stream().filter(r -> r.id().equals(id))
			    .findFirst().orElseThrow();
			assertThat(saved.incomeAllocation().allocations()).extracting(a -> a.amount())
			    .containsExactly("EQUAL".equals(mode) ? "500" : "250", "EQUAL".equals(mode) ? "500" : "750");
			service.manual(user, property, request);
			assertThat(cashBalances.workspace(user, property, "2026-10").buildings()).extracting(b -> b.income())
			    .containsExactlyInAnyOrder("EQUAL".equals(mode) ? "500" : "250", "EQUAL".equals(mode) ? "500" : "750");
			assertThat(cashBalances.workspace(user, property, "2026-10").bankBalance()).isEqualTo(baseline);
			service.cancel(user, property, id, "배분 정정");
			assertThat(cashBalances.workspace(user, property, "2026-10").buildings()).extracting(b -> b.income())
			    .containsOnly("0");
		}
		assertThat(count("bank_transactions")).isZero();
		assertThat(count("income_allocations")).isEqualTo(6);
		assertThat(count("payment_allocations")).isZero();
	}

	@Test
	void manualSharedIncomeRejectsFractionMismatchAndForeignBuildingAtomically() {
		List<UUID> targets = manualIncomeBuildings();
		var date = LocalDate.of(2026, 10, 15);
		for (var split : List.of(manualIncomeSplit(targets, "EQUAL", "0", "0"),
		    manualIncomeSplit(targets, "AMOUNT", "250", "750"),
		    manualIncomeSplit(List.of(targets.getFirst(), UUID.randomUUID()), "AMOUNT", "500", "501"))) {
			var request = new PaymentRequests.Manual(UUID.randomUUID(), null, date, "1001", null, "SHARED", "은행",
			    "예금이자", null, split);
			assertThatThrownBy(() -> service.manual(user, property, request)).isInstanceOf(PaymentException.class);
		}
		assertThat(count("payments")).isZero();
		assertThat(count("income_allocations")).isZero();
		var input = manualIncomeSplit(targets, "AMOUNT", "500", "501");
		var request = new PaymentRequests.Manual(UUID.randomUUID(), null, date, "1001", null, "SHARED", "은행", "예금이자",
		    null, input);
		service.manual(user, property, request);
		var changed = new PaymentRequests.Manual(request.id(), null, date, "1001", null, "SHARED", "은행", "예금이자", null,
		    manualIncomeSplit(targets, "AMOUNT", "501", "500"));
		assertThatThrownBy(() -> service.manual(user, property, changed)).isInstanceOf(PaymentException.class);
		assertThat(count("payments")).isEqualTo(1);
		assertThat(count("income_allocations")).isEqualTo(2);
	}

	/** 같은 은행 거래를 나중에 업로드하면 기존 수동 기타 입금으로 연결해 동별 입금을 중복 집계하지 않습니다. */
	@Test
	void laterBankImportLinksManualSharedIncomeWithoutDoubleCounting() {
		List<UUID> targets = manualIncomeBuildings();
		UUID id = UUID.randomUUID();
		service.manual(user, property, new PaymentRequests.Manual(id, null, LocalDate.of(2026, 10, 15), "1000", null,
		    "SHARED", "은행", "예금이자", null, manualIncomeSplit(targets, "EQUAL", "0", "0")));
		var file = bank("은행", "1000");
		var preview = banking.preview(user, property, file);
		var imported = banking.upload(user, property, file,
		    new com.moahome.server.banking.dto.BankingRequests.Import(
		        List.of(new com.moahome.server.banking.dto.BankingRequests.Selection(preview.rows().getFirst().id(),
		            null, null, null, null))));
		var bankReceipt = imported.rows().getFirst().paymentId();
		service.link(user, property, bankReceipt, id);
		var cash = cashBalances.workspace(user, property, "2026-10");
		assertThat(cash.buildings()).extracting(b -> b.income()).containsOnly("500");
		assertThat(cash.entries()).hasSize(2);
		assertThat(service.workspace(user, property).payments()).filteredOn(p -> p.id().equals(id)).singleElement()
		    .satisfies(p -> assertThat(p.bankTransactionId()).isNotNull());
		assertThat(count("income_allocations")).isEqualTo(2);
	}

	@Test
	void manualOtherIncomeCanRecoverExternalShareAndCannotUseSharedIncome() {
		List<UUID> targets = manualIncomeBuildings();
		UUID receipt = UUID.randomUUID();
		service.manual(user, property, new PaymentRequests.Manual(receipt, null, LocalDate.of(2026, 10, 15), "1000",
		    null, "OTHER", "외부 관리단", "분담금", null, null));
		var file = csv("거래일시,적요,출금액,입금액,잔액\n2026-10-15 08:00:00,공동 수리,1000,0,10000");
		var preview = banking.preview(user, property, file);
		var expense = new com.moahome.server.banking.dto.BankingRequests.Expense("공동 수리", null, "AMOUNT", false,
		    List.of(new com.moahome.server.banking.dto.BankingRequests.Allocation(null, "외부 관리단", "1000", null)));
		banking.upload(user, property, file,
		    new com.moahome.server.banking.dto.BankingRequests.Import(
		        List.of(new com.moahome.server.banking.dto.BankingRequests.Selection(preview.rows().getFirst().id(),
		            null, null, null, expense))));
		var external = cashBalances.workspace(user, property, "2026-10").externals().getFirst();
		cashBalances.settle(user, property, new com.moahome.server.banking.dto.BankingBalanceRequests.Settlement(
		    UUID.randomUUID(), external.id(), receipt, "500"));
		assertThat(cashBalances.workspace(user, property, "2026-10").externals().getFirst().received())
		    .isEqualTo("500");
		UUID shared = UUID.randomUUID();
		service.manual(user, property, new PaymentRequests.Manual(shared, null, LocalDate.of(2026, 10, 15), "1000",
		    null, "SHARED", "은행", "예금이자", null, manualIncomeSplit(targets, "EQUAL", "0", "0")));
		assertThatThrownBy(() -> cashBalances.settle(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.Settlement(UUID.randomUUID(), external.id(),
		        shared, "500")))
		    .isInstanceOf(PaymentException.class);
		service.cancel(user, property, receipt, "오입금");
		assertThat(cashBalances.workspace(user, property, "2026-10").externals().getFirst().received()).isEqualTo("0");
	}

	/** 동이 직접 납부한 돈은 세대 없이 한 동 전액 또는 2동 100만원·3동 50만원으로 수동·업로드 모두 지정합니다. */
	@Test
	void buildingDepositsSupportSingleTargetAndUnequalAmountsForManualAndUpload() {
		List<UUID> targets = manualIncomeBuildings();
		jdbc.update("update buildings set name='2동' where id=?", targets.getFirst());
		jdbc.update("update buildings set name='3동' where id=?", targets.getLast());
		var single = new com.moahome.server.banking.dto.BankingRequests.Expense("동별 입금", null, "AMOUNT", false, List.of(
		    new com.moahome.server.banking.dto.BankingRequests.Allocation(targets.getFirst(), null, "1000000", null)));
		service.manual(user, property, new PaymentRequests.Manual(UUID.randomUUID(), null, LocalDate.of(2026, 10, 15),
		    "1000000", null, "SHARED", "2동", "동별 입금", null, single));
		var split = new com.moahome.server.banking.dto.BankingRequests.Expense("동별 입금", null, "AMOUNT", false, List.of(
		    new com.moahome.server.banking.dto.BankingRequests.Allocation(targets.getFirst(), null, "1000000", null),
		    new com.moahome.server.banking.dto.BankingRequests.Allocation(targets.getLast(), null, "500000", null)));
		service.manual(user, property, new PaymentRequests.Manual(UUID.randomUUID(), null, LocalDate.of(2026, 10, 15),
		    "1500000", null, "SHARED", "동별 분담금", "동별 입금", null, split));
		var file = bank("추가 동별 분담금", "1500000");
		var preview = banking.preview(user, property, file);
		banking.upload(user, property, file,
		    new com.moahome.server.banking.dto.BankingRequests.Import(
		        List.of(new com.moahome.server.banking.dto.BankingRequests.Selection(preview.rows().getFirst().id(),
		            null, "동별 입금", null, null, split))));
		var cash = cashBalances.workspace(user, property, "2026-10");
		assertThat(cash.buildings()).filteredOn(b -> b.id().equals(targets.getFirst())).singleElement()
		    .satisfies(b -> assertThat(b.income()).isEqualTo("3000000"));
		assertThat(cash.buildings()).filteredOn(b -> b.id().equals(targets.getLast())).singleElement()
		    .satisfies(b -> assertThat(b.income()).isEqualTo("1000000"));
		assertThat(service.workspace(user, property).payments()).allSatisfy(p -> {
			assertThat(p.receiptType()).isEqualTo("OTHER");
			assertThat(p.unitId()).isEmpty();
			assertThat(p.allocations()).isEmpty();
		});
		assertThat(count("bank_transactions")).isEqualTo(1);
		assertThat(count("payments")).isEqualTo(3);
		assertThat(count("income_allocations")).isEqualTo(5);
	}

	private List<UUID> manualIncomeBuildings() {
		List<UUID> ids = List.of(UUID.randomUUID(), UUID.randomUUID());
		for (int i = 0; i < ids.size(); i++)
			jdbc.update(
			    "insert into buildings(id,property_id,name,sort_order,status,created_at,updated_at) values (?,?,?,?,'ACTIVE',now(),now())",
			    ids.get(i), property, (102 + i) + "동", i);
		cashBalances.saveOpenings(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.Opening(LocalDate.of(2026, 9, 30), ids.stream()
		        .map(id -> new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(id, "0")).toList()));
		return ids;
	}

	private com.moahome.server.banking.dto.BankingRequests.Expense manualIncomeSplit(List<UUID> targets, String mode,
	    String first, String second) {
		return new com.moahome.server.banking.dto.BankingRequests.Expense("예금이자", null, mode, false,
		    List.of(
		        new com.moahome.server.banking.dto.BankingRequests.Allocation(targets.getFirst(), null, first, "25"),
		        new com.moahome.server.banking.dto.BankingRequests.Allocation(targets.getLast(), null, second, "75")));
	}

	/** 추가 통장도 각각 다른 날짜의 실제 잔액을 등록하고 동별 현금·입금·인계는 만들지 않습니다. */
	@Test
	void accountOpeningsUseIndependentDatesAndDoNotCreateBuildingCashOrReceipts() {
		var first = bankAccountSettings.read(user, property);
		var second = addAccount("090", "카카오뱅크", "3333012345678", "예비비");
		var before = cashBalances.workspace(user, property, "2026-10");
		long batches = count("opening_balance_batches");
		var a = new com.moahome.server.banking.dto.BankingBalanceRequests.AccountOpening(UUID.randomUUID(),
		    first.accountId(), LocalDate.of(2026, 7, 1), "3550000", 0L);
		var b = new com.moahome.server.banking.dto.BankingBalanceRequests.AccountOpening(UUID.randomUUID(),
		    second.accountId(), LocalDate.of(2026, 10, 1), "500000", 0L);
		cashBalances.saveAccountOpening(user, property, a);
		cashBalances.saveAccountOpening(user, property, b);
		cashBalances.saveAccountOpening(user, property, b);
		var after = cashBalances.workspace(user, property, "2026-10");
		assertThat(after.accounts()).filteredOn(r -> r.id().equals(first.accountId())).singleElement().satisfies(r -> {
			assertThat(r.openingDate()).isEqualTo(a.cutoffDate());
			assertThat(r.balance()).isEqualTo("3550000");
		});
		assertThat(after.accounts()).filteredOn(r -> r.id().equals(second.accountId())).singleElement().satisfies(r -> {
			assertThat(r.openingDate()).isEqualTo(b.cutoffDate());
			assertThat(r.balance()).isEqualTo("500000");
		});
		assertThat(after.bankBalance()).isEqualTo("4050000");
		assertThat(after.buildings()).isEqualTo(before.buildings());
		assertThat(after.entries()).isEmpty();
		assertThat(count("bank_transactions")).isZero();
		assertThat(count("payments")).isZero();
		assertThat(count("opening_balance_batches")).isEqualTo(batches);
		assertThat(count("bank_opening_balances")).isEqualTo(2);
	}

	@Test
	void accountOpeningCorrectionsPreserveHistoryAndRejectStaleOrChangedRequests() {
		var account = bankAccountSettings.read(user, property).accountId();
		var a = new com.moahome.server.banking.dto.BankingBalanceRequests.AccountOpening(UUID.randomUUID(), account,
		    LocalDate.of(2026, 7, 1), "0", 0L);
		cashBalances.saveAccountOpening(user, property, a);
		var b = new com.moahome.server.banking.dto.BankingBalanceRequests.AccountOpening(UUID.randomUUID(), account,
		    LocalDate.of(2026, 10, 1), "4000000", 1L);
		cashBalances.saveAccountOpening(user, property, b);
		cashBalances.saveAccountOpening(user, property, b);
		assertThat(count("bank_opening_balances")).isEqualTo(2);
		assertThat(cashBalances.workspace(user, property, "2026-10").accounts()).singleElement().satisfies(r -> {
			assertThat(r.openingRevision()).isEqualTo(2);
			assertThat(r.openingBalance()).isEqualTo("4000000");
		});
		for (var invalid : List.of(
		    new com.moahome.server.banking.dto.BankingBalanceRequests.AccountOpening(UUID.randomUUID(), account,
		        b.cutoffDate(), "5000000", 1L),
		    new com.moahome.server.banking.dto.BankingBalanceRequests.AccountOpening(b.id(), account, b.cutoffDate(),
		        "5000000", 1L)))
			assertThatThrownBy(() -> cashBalances.saveAccountOpening(user, property, invalid)).isInstanceOfSatisfying(
			    PaymentException.class, e -> assertThat(e.code()).isEqualTo("BANK_OPENING_CONFLICT"));
		assertThatThrownBy(() -> jdbc.update("update bank_opening_balances set amount=1 where id=?", b.id()))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
		assertThatThrownBy(() -> jdbc.update("delete from bank_opening_balances where id=?", b.id()))
		    .isInstanceOf(org.springframework.dao.DataAccessException.class);
		assertThat(count("bank_opening_balances")).isEqualTo(2);
	}

	@Test
	void accountOpeningUsesLaterBankReportedBalanceAndDoesNotLeakFutureBaselineIntoPastMonth() {
		var account = bankAccountSettings.read(user, property).accountId();
		var file = csv("거래일시,적요,출금액,입금액,잔액\n2026-10-15 09:00:00,미분류입금,0,1000,501000");
		var preview = banking.preview(user, property, file);
		banking.upload(user, property, file,
		    new com.moahome.server.banking.dto.BankingRequests.Import(
		        List.of(new com.moahome.server.banking.dto.BankingRequests.Selection(preview.rows().getFirst().id(),
		            null, null, null, null))));
		cashBalances.saveAccountOpening(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.AccountOpening(UUID.randomUUID(), account,
		        LocalDate.of(2026, 10, 1), "500000", 0L));
		assertThat(cashBalances.workspace(user, property, "2026-10").accounts()).singleElement().satisfies(r -> {
			assertThat(r.balance()).isEqualTo("501000");
			assertThat(r.openingBalance()).isEqualTo("500000");
		});
		assertThat(cashBalances.workspace(user, property, "2026-09").accounts()).noneMatch(r -> r.balance() != null);
		cashBalances.saveAccountOpening(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.AccountOpening(UUID.randomUUID(), account,
		        LocalDate.of(2026, 10, 15), "502000", 1L));
		assertThat(cashBalances.workspace(user, property, "2026-10").accounts()).singleElement()
		    .satisfies(r -> assertThat(r.balance()).isEqualTo("502000"));
	}

	@Test
	void accountOpeningRejectsFutureNegativeUnknownClosedAndUnauthorizedRequests() {
		var account = bankAccountSettings.read(user, property).accountId();
		var second = addAccount("090", "카카오뱅크", "3333012345678", "예비비");
		bankAccountSettings.close(user, property, second.accountId(),
		    new com.moahome.server.banking.dto.BankAccountSettings.Close(second.updatedAt()));
		for (var invalid : List.of(
		    new com.moahome.server.banking.dto.BankingBalanceRequests.AccountOpening(UUID.randomUUID(), account,
		        LocalDate.of(2026, 10, 16), "0", 0L),
		    new com.moahome.server.banking.dto.BankingBalanceRequests.AccountOpening(UUID.randomUUID(), account,
		        LocalDate.of(2026, 10, 1), "-1", 0L),
		    new com.moahome.server.banking.dto.BankingBalanceRequests.AccountOpening(UUID.randomUUID(),
		        UUID.randomUUID(), LocalDate.of(2026, 10, 1), "0", 0L),
		    new com.moahome.server.banking.dto.BankingBalanceRequests.AccountOpening(UUID.randomUUID(),
		        second.accountId(), LocalDate.of(2026, 10, 1), "0", 0L)))
			assertThatThrownBy(() -> cashBalances.saveAccountOpening(user, property, invalid))
			    .isInstanceOf(PaymentException.class);
		var outsider = users.saveAndFlush(User.create("외부관리자", null)).getId();
		assertThatThrownBy(() -> cashBalances.saveAccountOpening(outsider, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.AccountOpening(UUID.randomUUID(), account,
		        LocalDate.of(2026, 10, 1), "0", 0L)))
		    .isInstanceOf(AuthException.class);
		assertThat(count("bank_opening_balances")).isZero();
	}

	/** 새 스키마와 기존 인계 자료 업그레이드 모두 기초 잔액·기준일을 보존합니다. */
	@Test
	void independentAccountOpeningMigrationPreservesExistingHandoverBalances() {
		registration.register(user, registrationOpeningRequest(true, "2026-10"));
		String schema = "account_opening_" + UUID.randomUUID().toString().replace("-", "");
		var previous = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
		    .schemas(schema).defaultSchema(schema).target("20261018050254").load();
		previous.migrate();
		for (String table : List.of("users", "properties", "buildings", "units", "bank_accounts",
		    "opening_balance_batches", "bank_opening_balances"))
			copyPreviousTable(schema, table);
		List<Map<String, Object>> before = jdbc.queryForList(
		    "select id,amount,bank_account_id,batch_id from " + schema + ".bank_opening_balances order by id");
		var upgraded = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
		    .schemas(schema).defaultSchema(schema).load();
		int pending = upgraded.info().pending().length;
		assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(pending);
		upgraded.validate();
		assertThat(jdbc.queryForList(
		    "select id,amount,bank_account_id,batch_id from " + schema + ".bank_opening_balances order by id"))
		    .isEqualTo(before);
		assertThat(jdbc.queryForObject("select count(*) from " + schema + ".bank_opening_balances o join " + schema
		    + ".opening_balance_batches b on b.id=o.batch_id where o.cutoff_date=b.cutoff_date and o.revision=0 and o.recorded_by=b.created_by",
		    Long.class)).isEqualTo((long) before.size());
		jdbc.execute("drop schema " + schema + " cascade");
	}

	/** 통장을 나중에 추가해도 기존 단일 통장 시절 확정한 잔고·이력을 같은 통장으로 보존합니다. */
	@Test
	void originalCashOpeningMigrationUsesAccountAtRegistrationAndPreservesHistory() {
		List<UUID> targets = manualIncomeBuildings();
		cashBalances.correctOpenings(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningCorrection(UUID.randomUUID(),
		        LocalDate.of(2026, 7, 1),
		        List.of(
		            new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningCorrectionPart(targets.getFirst(),
		                "688582", 0L),
		            new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningCorrectionPart(targets.getLast(),
		                "100000", 0L))));
		var first = bankAccountSettings.read(user, property).accountId();
		var second = addAccount("090", "카카오뱅크", "3333012345678", "예비비").accountId();
		String schema = "cash_scope_" + UUID.randomUUID().toString().replace("-", "");
		var previous = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
		    .schemas(schema).defaultSchema(schema).target("20261018052108").load();
		previous.migrate();
		for (String table : List.of("users", "properties", "buildings", "units", "bank_accounts",
		    "building_cash_openings", "building_cash_opening_changes"))
			copyPreviousTable(schema, table);
		jdbc.update("update " + schema + ".bank_accounts set created_at='2026-06-01T00:00:00Z' where id=?", first);
		jdbc.update("update " + schema + ".bank_accounts set created_at='2026-10-18T00:00:00Z' where id=?", second);
		// 이전 스키마의 등록 시점을 고정하며 금액·정정 버전은 건드리지 않습니다.
		jdbc.execute(
		    "alter table " + schema + ".building_cash_openings disable trigger building_cash_openings_change_check");
		jdbc.execute("update " + schema + ".building_cash_openings set created_at='2026-07-01T00:00:00Z'");
		jdbc.execute(
		    "alter table " + schema + ".building_cash_openings enable trigger building_cash_openings_change_check");
		List<Map<String, Object>> before = jdbc.queryForList(
		    "select id,cutoff_date,amount,revision from " + schema + ".building_cash_openings order by id");
		List<Map<String, Object>> historyBefore = jdbc.queryForList(
		    "select id,opening_id,request_id,previous_revision,previous_amount,new_amount,changed_by from " + schema
		        + ".building_cash_opening_changes order by id");
		var upgraded = org.flywaydb.core.Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
		    .schemas(schema).defaultSchema(schema).load();
		upgraded.migrate();
		upgraded.validate();
		assertThat(jdbc.queryForList(
		    "select id,cutoff_date,amount,revision from " + schema + ".building_cash_openings order by id"))
		    .isEqualTo(before);
		assertThat(historyBefore).hasSize(2);
		assertThat(jdbc.queryForList(
		    "select id,opening_id,request_id,previous_revision,previous_amount,new_amount,changed_by from " + schema
		        + ".building_cash_opening_changes order by id"))
		    .isEqualTo(historyBefore);
		assertThat(jdbc.queryForList(
		    "select distinct bank_account_id from " + schema + ".building_cash_opening_changes", UUID.class))
		    .containsExactly(first);
		assertThat(
		    jdbc.queryForList("select distinct bank_account_id from " + schema + ".building_cash_openings", UUID.class))
		    .containsExactly(first);
		assertThat(jdbc.queryForObject(
		    "select count(*) from " + schema + ".building_cash_openings where bank_account_id=?", Long.class, second))
		    .isZero();
		jdbc.execute("drop schema " + schema + " cascade");
	}

	/** 통장 소속이 미정인 기존 확정값은 초안으로 표시하고 명시적인 통장별 확정 전에는 잔고로 복제하지 않습니다. */
	@Test
	void unassignedLegacyOpeningIsOfferedForExplicitConfirmationWithoutLosingOriginal() {
		List<UUID> targets = manualIncomeBuildings();
		var first = bankAccountSettings.read(user, property).accountId();
		addAccount("090", "카카오뱅크", "3333012345678", "예비비");
		var view = cashBalances.workspace(user, property, "2026-10", first);
		assertThat(view.legacyOpening()).isNotNull();
		assertThat(view.legacyOpening().buildings()).hasSize(2);
		assertThat(view.buildings())
		    .allMatch(b -> b.openingBalance() == null && b.balance() == null && "OPENING_REQUIRED".equals(b.status()));
		cashBalances.saveOpenings(user, property, new com.moahome.server.banking.dto.BankingBalanceRequests.Opening(
		    view.legacyOpening().cutoffDate(),
		    view.legacyOpening().buildings().stream().map(
		        b -> new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(b.buildingId(), b.amount()))
		        .toList(),
		    first));
		var confirmed = cashBalances.workspace(user, property, "2026-10", first);
		assertThat(confirmed.legacyOpening()).isNull();
		assertThat(confirmed.buildings()).allMatch(b -> "READY".equals(b.status()));
		assertThat(jdbc.queryForObject(
		    "select count(*) from building_cash_openings where property_id=? and bank_account_id is null", Long.class,
		    property)).isEqualTo((long) targets.size());
	}

	/** 같은 동이라도 통장별 기준일·보유금·입출금을 분리하고 전체는 각각 계산한 결과를 합산합니다. */
	@Test
	void scopesBuildingOpeningsMovementsAndCorrectionsByBankAccount() {
		List<UUID> targets = manualIncomeBuildings();
		var first = bankAccountSettings.read(user, property).accountId();
		var second = addAccount("090", "카카오뱅크", "3333012345678", "예비비").accountId();
		var a = new com.moahome.server.banking.dto.BankingBalanceRequests.Opening(LocalDate.of(2026, 7, 1),
		    List.of(
		        new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(targets.getFirst(), "1000000"),
		        new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(targets.getLast(), "500000")),
		    first);
		var b = new com.moahome.server.banking.dto.BankingBalanceRequests.Opening(LocalDate.of(2026, 9, 30),
		    List.of(new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(targets.getFirst(), "200000"),
		        new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(targets.getLast(), "300000")),
		    second);
		cashBalances.saveOpenings(user, property, a);
		cashBalances.saveOpenings(user, property, b);
		cashBalances.saveOpenings(user, property, b);
		var split = new com.moahome.server.banking.dto.BankingRequests.Expense("동별 입금", null, "AMOUNT", false,
		    List.of(
		        new com.moahome.server.banking.dto.BankingRequests.Allocation(targets.getFirst(), null, "70000", null),
		        new com.moahome.server.banking.dto.BankingRequests.Allocation(targets.getLast(), null, "30000", null)));
		service.manual(user, property, new PaymentRequests.Manual(UUID.randomUUID(), null, LocalDate.of(2026, 10, 15),
		    "100000", second, "SHARED", "동별 분담금", "동별 입금", null, split));
		var firstView = cashBalances.workspace(user, property, "2026-10", first);
		var secondView = cashBalances.workspace(user, property, "2026-10", second);
		assertThat(firstView.accountId()).isEqualTo(first);
		assertThat(firstView.cutoffDate()).isEqualTo(a.cutoffDate());
		assertThat(firstView.buildings()).extracting(r -> r.balance()).containsExactlyInAnyOrder("1000000", "500000");
		assertThat(firstView.entries()).isEmpty();
		assertThat(secondView.accountId()).isEqualTo(second);
		assertThat(secondView.cutoffDate()).isEqualTo(b.cutoffDate());
		assertThat(secondView.buildings()).extracting(r -> r.balance()).containsExactlyInAnyOrder("270000", "330000");
		assertThat(secondView.entries()).hasSize(2).allMatch(e -> second.equals(e.accountId()));
		var all = cashBalances.workspace(user, property, "2026-10");
		assertThat(all.cutoffDate()).isNull();
		assertThat(all.buildings()).extracting(r -> r.balance()).containsExactlyInAnyOrder("1270000", "830000");
		var correction = new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningCorrection(UUID.randomUUID(),
		    a.cutoffDate(),
		    List.of(
		        new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningCorrectionPart(targets.getFirst(),
		            "1100000", 0L),
		        new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningCorrectionPart(targets.getLast(),
		            "500000", 0L)),
		    first);
		cashBalances.correctOpenings(user, property, correction);
		cashBalances.correctOpenings(user, property, correction);
		assertThat(cashBalances.workspace(user, property, "2026-10", second).buildings())
		    .isEqualTo(secondView.buildings());
		assertThat(cashBalances.workspace(user, property, "2026-10").buildings()).extracting(r -> r.balance())
		    .containsExactlyInAnyOrder("1370000", "830000");
		assertThat(jdbc.queryForObject("select count(*) from building_cash_opening_changes where bank_account_id=?",
		    Long.class, first)).isEqualTo(2);
		assertThatThrownBy(() -> cashBalances.correctOpenings(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningCorrection(correction.id(), b.cutoffDate(),
		        correction.buildings(), second)))
		    .isInstanceOfSatisfying(PaymentException.class,
		        e -> assertThat(e.code()).isEqualTo("CASH_OPENING_CONFLICT"));
		addAccount("020", "우리은행", "100200300400", "추가 통장");
		assertThat(cashBalances.workspace(user, property, "2026-10").buildings())
		    .allMatch(r -> r.balance() == null && "OPENING_REQUIRED".equals(r.status()));
		assertThat(cashBalances.workspace(user, property, "2026-10", first).buildings())
		    .allMatch(r -> "READY".equals(r.status()));
	}

	/** 은행 파일이 없어도 통장별 기준값과 수동 동별 입금을 계산하고, 실제 은행 확인값은 별도로 둡니다. */
	@Test
	void accountCalculationIncludesConfirmedManualIncomeWithoutClaimingBankVerification() {
		List<UUID> targets = manualIncomeBuildings();
		var account = bankAccountSettings.read(user, property).accountId();
		cashBalances.saveOpenings(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.Opening(LocalDate.of(2026, 9, 30),
		        List.of(
		            new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(targets.getFirst(),
		                "1000000"),
		            new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(targets.getLast(), "500000")),
		        account));
		var split = new com.moahome.server.banking.dto.BankingRequests.Expense("동별 입금", null, "AMOUNT", false,
		    List.of(
		        new com.moahome.server.banking.dto.BankingRequests.Allocation(targets.getFirst(), null, "11455", null),
		        new com.moahome.server.banking.dto.BankingRequests.Allocation(targets.getLast(), null, "11455", null)));
		service.manual(user, property, new PaymentRequests.Manual(UUID.randomUUID(), null, LocalDate.of(2026, 10, 15),
		    "22910", account, "SHARED", "분담금", "동별 입금", null, split));
		var view = cashBalances.workspace(user, property, "2026-10", account);
		assertThat(view.bankBalance()).isNull();
		assertThat(view.accounts()).singleElement().satisfies(a -> {
			assertThat(a.balance()).isNull();
			assertThat(a.asOf()).isNull();
			assertThat(a.calculatedBalance()).isEqualTo("1522910");
			assertThat(a.calculationBasisDate()).isEqualTo(LocalDate.of(2026, 9, 30));
		});
		UUID other = UUID.randomUUID();
		service.manual(user, property, new PaymentRequests.Manual(other, null, LocalDate.of(2026, 10, 15), "30000",
		    account, "OTHER", "외부 분담금", "수리비", null, null));
		var withOther = cashBalances.workspace(user, property, "2026-10", account);
		assertThat(withOther.accounts().getFirst().calculatedBalance()).isEqualTo("1552910");
		assertThat(withOther.buildings()).isEqualTo(view.buildings());
		service.cancel(user, property, other, "오입력");
		assertThat(cashBalances.workspace(user, property, "2026-10", account).accounts().getFirst().calculatedBalance())
		    .isEqualTo("1522910");
		UUID extra = UUID.randomUUID();
		jdbc.update(
		    "insert into buildings(id,property_id,name,sort_order,status,created_at,updated_at) values (?,?,?,3,'ACTIVE',now(),now())",
		    extra, property, "104동");
		assertThat(cashBalances.workspace(user, property, "2026-10", account).accounts().getFirst().calculatedBalance())
		    .isNull();
	}

	/** 원본·이체는 전액, 미연결 수동 기타 입금은 한 번 반영하고 기준일 이전 월은 역산합니다. */
	@Test
	void accountCalculationPreservesActualSnapshotAndCountsRawTransfersWithoutDuplicatingReceipt() {
		List<UUID> targets = manualIncomeBuildings();
		var account = bankAccountSettings.read(user, property).accountId();
		jdbc.update("update bank_accounts set valid_from=date '2026-08-01' where id=?", account);
		cashBalances.saveOpenings(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.Opening(LocalDate.of(2026, 9, 30),
		        List.of(
		            new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(targets.getFirst(),
		                "1000000"),
		            new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(targets.getLast(), "0")),
		        account));
		var file = csv(
		    "거래일시,적요,출금액,입금액,잔액\n2026-10-15 09:00:00,계좌 이체,0,5000,1005000\n2026-10-15 10:00:00,계좌 이체,2000,0,1003000");
		var preview = banking.preview(user, property, file, account);
		banking.upload(user, property, file,
		    new com.moahome.server.banking.dto.BankingRequests.Import(
		        preview.rows().stream().map(r -> new com.moahome.server.banking.dto.BankingRequests.Selection(r.id(),
		            null, null, null, null, null, true)).toList(),
		        account));
		UUID manual = UUID.randomUUID();
		service.manual(user, property, new PaymentRequests.Manual(manual, null, LocalDate.of(2026, 10, 15), "10000",
		    account, "OTHER", "분담금", "수리비", null, null));
		var view = cashBalances.workspace(user, property, "2026-10", account);
		assertThat(view.bankBalance()).isEqualTo("1003000");
		assertThat(view.accounts().getFirst().calculatedBalance()).isEqualTo("1013000");
		assertThat(view.entries()).isEmpty();
		assertThat(view.buildings()).extracting(b -> b.balance()).containsExactlyInAnyOrder("1000000", "0");
		var matchingFile = bank("분담금", "10000");
		var matchingPreview = banking.preview(user, property, matchingFile, account);
		var imported = banking.upload(user, property, matchingFile,
		    new com.moahome.server.banking.dto.BankingRequests.Import(
		        List.of(new com.moahome.server.banking.dto.BankingRequests.Selection(
		            matchingPreview.rows().getFirst().id(), null, null, null, null)),
		        account));
		var bankReceipt = imported.rows().stream().filter(r -> r.amount().equals("10000")).findFirst().orElseThrow()
		    .paymentId();
		service.link(user, property, bankReceipt, manual);
		assertThat(cashBalances.workspace(user, property, "2026-10", account).accounts().getFirst().calculatedBalance())
		    .isEqualTo("1013000");
		service.manual(user, property, new PaymentRequests.Manual(UUID.randomUUID(), null, LocalDate.of(2026, 9, 15),
		    "1000", account, "OTHER", "기존 분담금", "수리비", null, null));
		assertThat(cashBalances.workspace(user, property, "2026-09", account).accounts().getFirst().calculatedBalance())
		    .isEqualTo("1000000");
		assertThat(cashBalances.workspace(user, property, "2026-08", account).accounts().getFirst().calculatedBalance())
		    .isEqualTo("999000");
	}

	/** 뒤늦게 앱에 등록한 통장도 실제 시작 근거 전에는 선택·합산하지 않으며 오래된 선택은 전체로 복원합니다. */
	@Test
	void excludesNewAccountBeforeFirstUseFromOptionsAndBuildingTotals() {
		List<UUID> targets = manualIncomeBuildings();
		var first = bankAccountSettings.read(user, property).accountId();
		jdbc.update("update bank_accounts set valid_from=date '2026-07-01' where id=?", first);
		var second = addAccount("090", "카카오뱅크", "3333012345678", "예비비").accountId();
		cashBalances.saveOpenings(user, property, new com.moahome.server.banking.dto.BankingBalanceRequests.Opening(
		    LocalDate.of(2026, 7, 1),
		    List.of(new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(targets.getFirst(), "100000"),
		        new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(targets.getLast(), "200000")),
		    first));
		cashBalances.saveOpenings(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.Opening(LocalDate.of(2026, 9, 30),
		        List.of(
		            new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(targets.getFirst(),
		                "1000000"),
		            new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(targets.getLast(), "500000")),
		        second));
		var august = cashBalances.workspace(user, property, "2026-08");
		assertThat(august.accounts()).extracting(a -> a.id()).containsExactly(first);
		assertThat(august.cutoffDate()).isEqualTo(LocalDate.of(2026, 7, 1));
		assertThat(august.buildings()).extracting(b -> b.balance()).containsExactlyInAnyOrder("100000", "200000");
		var staleSelection = cashBalances.workspace(user, property, "2026-08", second);
		assertThat(staleSelection.accountId()).isNull();
		assertThat(staleSelection.buildings()).isEqualTo(august.buildings());
		assertThat(staleSelection.accounts()).isEqualTo(august.accounts());
		// 전월 말 기준 잔고만 입력해도 10월 등록 계좌가 9월 선택 목록에 생기지 않습니다.
		assertThat(cashBalances.workspace(user, property, "2026-09", second).accountId()).isNull();
		var october = cashBalances.workspace(user, property, "2026-10", second);
		assertThat(october.accountId()).isEqualTo(second);
		assertThat(october.accounts()).filteredOn(a -> second.equals(a.id())).singleElement()
		    .satisfies(a -> assertThat(a.calculatedBalance()).isEqualTo("1500000"));
		assertThat(october.buildings()).extracting(b -> b.balance()).containsExactlyInAnyOrder("1000000", "500000");
		// 실제 과거 원본을 나중에 가져온 경우에는 그 사용 근거가 있는 월부터 정상 조회합니다.
		var file = kakaoFile(csv("거래일시,적요,출금액,입금액,잔액\n2026-08-15 09:00:00,과거 입금,0,1000,1499000"));
		var preview = banking.preview(user, property, file, second);
		banking.upload(user, property, file,
		    new com.moahome.server.banking.dto.BankingRequests.Import(
		        List.of(new com.moahome.server.banking.dto.BankingRequests.Selection(preview.rows().getFirst().id(),
		            null, null, null, null)),
		        second));
		var importedHistory = cashBalances.workspace(user, property, "2026-08", second);
		assertThat(importedHistory.accountId()).isEqualTo(second);
		assertThat(importedHistory.accounts()).filteredOn(a -> second.equals(a.id())).singleElement()
		    .satisfies(a -> assertThat(a.balance()).isEqualTo("1499000"));
		assertThat(cashBalances.workspace(user, property, "2026-07").accounts()).extracting(a -> a.id())
		    .containsExactly(first);
	}

	/** 해당 월에 사용 근거가 있는 통장이 없으면 이후 잔고나 가짜 0원 동별 합계를 만들지 않습니다. */
	@Test
	void monthBeforeAnyAccountUseHasNoAccountOrBuildingBalance() {
		List<UUID> targets = manualIncomeBuildings();
		var account = bankAccountSettings.read(user, property).accountId();
		cashBalances.saveOpenings(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.Opening(LocalDate.of(2026, 9, 30),
		        List.of(
		            new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(targets.getFirst(),
		                "1000000"),
		            new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(targets.getLast(), "500000")),
		        account));
		var before = cashBalances.workspace(user, property, "2026-08", account);
		assertThat(before.accountId()).isNull();
		assertThat(before.accounts()).isEmpty();
		assertThat(before.buildings()).isEmpty();
		assertThat(before.cutoffDate()).isNull();
		assertThat(before.bankBalance()).isNull();
	}

	@Test
	void scopedBuildingOpeningRejectsForeignAccountAndIncompleteTargetsWithoutChangingOtherBank() {
		List<UUID> targets = manualIncomeBuildings();
		var own = bankAccountSettings.read(user, property).accountId();
		List<BankingBalanceRequests.OpeningPart> rows = List
		    .of(new com.moahome.server.banking.dto.BankingBalanceRequests.OpeningPart(targets.getFirst(), "100"));
		assertThatThrownBy(() -> cashBalances.saveOpenings(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.Opening(LocalDate.of(2026, 10, 1), rows,
		        UUID.randomUUID())))
		    .isInstanceOf(PaymentException.class);
		assertThatThrownBy(() -> cashBalances.saveOpenings(user, property,
		    new com.moahome.server.banking.dto.BankingBalanceRequests.Opening(LocalDate.of(2026, 10, 1), rows, own)))
		    .isInstanceOf(PaymentException.class);
		assertThat(jdbc.queryForObject("select count(*) from building_cash_openings where bank_account_id is not null",
		    Long.class)).isZero();
		assertThatThrownBy(() -> cashBalances.workspace(user, property, "2026-10", UUID.randomUUID()))
		    .isInstanceOf(PaymentException.class);
	}

	/** 지원 여부는 은행명이나 Client 버튼이 아니라 저장된 코드로 검사하며 호환 업로드도 우회하지 않습니다. */
	@Test
	void rejectsUnsupportedBankInPreviewImportAndLegacyEndpoints() {
		jdbc.update("update bank_accounts set bank_code='032',bank_name='하나은행' where property_id=?", property);
		var account = bankAccountSettings.read(user, property).accountId();
		var file = bank("김대표", "50000");
		assertThat(banking.workspace(user, property).accounts()).singleElement().satisfies(a -> {
			assertThat(a.bankCode()).isEqualTo("032");
			assertThat(a.importSupport().enabled()).isFalse();
		});
		assertThatThrownBy(() -> banking.preview(user, property, file, account))
		    .isInstanceOf(PaymentException.class).hasMessage("BANK_IMPORT_UNSUPPORTED");
		assertThatThrownBy(() -> banking.upload(user, property, file,
		    new com.moahome.server.banking.dto.BankingRequests.Import(List.of(
		        new com.moahome.server.banking.dto.BankingRequests.Selection(UUID.randomUUID(), null, null, null, null)), account)))
		    .isInstanceOf(PaymentException.class).hasMessage("BANK_IMPORT_UNSUPPORTED");
		assertThatThrownBy(() -> service.preview(user, property, file))
		    .isInstanceOf(PaymentException.class).hasMessage("BANK_IMPORT_UNSUPPORTED");
		assertThatThrownBy(() -> service.importFile(user, property, file))
		    .isInstanceOf(PaymentException.class).hasMessage("BANK_IMPORT_UNSUPPORTED");
		assertThat(count("bank_transactions")).isZero();
		assertThat(count("payments")).isZero();
	}

	/** 같은 날·상대·금액도 다른 일시와 잔액이면 각각 수납하고 다시 가져올 때만 제외합니다. */
	@Test
	void retainsSeparateDepositsAndDeduplicatesTheirReimport() {
		var file = csv("거래일시,적요,출금액,입금액,잔액\n2026-10-15 09:00:00,김대표,0,30000,100000\n2026-10-15 10:00:00,김대표,0,30000,130000");
		var preview = banking.preview(user, property, file);
		assertThat(preview.rows()).hasSize(2);
		assertThat(preview.rows().getFirst().id()).isNotEqualTo(preview.rows().getLast().id());
		service.importFile(user, property, file);
		assertThat(count("bank_transactions")).isEqualTo(2);
		assertThat(service.workspace(user, property).payments()).hasSize(2).allMatch(p -> p.status().equals("CONFIRMED"));
		assertThat(banking.preview(user, property, file).duplicateCount()).isEqualTo(2);
		service.importFile(user, property, file);
		assertThat(count("bank_transactions")).isEqualTo(2);
	}

	/** 농협 음수 출금은 은행 잔액 증가로 저장하되 같은 주민 이름이어도 자동 세대 수납하지 않습니다. */
	@Test
	void importsNegativeNhWithdrawalAsPendingIncreaseWithOriginalSign() throws Exception {
		jdbc.update("update bank_accounts set bank_code='011' where property_id=?", property);
		try (var workbook = new org.apache.poi.hssf.usermodel.HSSFWorkbook();
		    var bytes = new java.io.ByteArrayOutputStream()) {
			var sheet = workbook.createSheet("거래");
			List<String> headers = List.of("구분", "거래일자", "출금금액(원)", "입금금액(원)", "거래 후 잔액(원)",
			    "거래내용", "거래기록사항", "거래점", "거래시간", "이체메모", "거래메모");
			var header = sheet.createRow(0);
			for (int index = 0; index < headers.size(); index++)
				header.createCell(index).setCellValue(headers.get(index));
			for (int index = 0; index < 2; index++) {
				var row = sheet.createRow(index + 1);
				List<String> cells = List.of("" + (index + 1), "2026/10/15", index == 0 ? "0" : "-5000",
				    index == 0 ? "50000" : "0", index == 0 ? "150000" : "155000", "거래 종류", "김대표", "검증점",
				    index == 0 ? "09:00:00" : "10:00:00", "", "");
				for (int column = 0; column < cells.size(); column++)
					row.createCell(column).setCellValue(cells.get(column));
			}
			workbook.write(bytes);
			var file = new MockMultipartFile("file", "농협.xls", "application/vnd.ms-excel", bytes.toByteArray());
			var preview = banking.preview(user, property, file);
			assertThat(preview.rows()).hasSize(2);
			assertThat(preview.rows()).filteredOn(r -> r.amount().equals("5000")).singleElement()
			    .satisfies(r -> assertThat(r.unitId()).isEmpty());
			var saved = service.importFile(user, property, file);
			assertThat(saved.payments()).filteredOn(p -> p.amount().equals("5000")).singleElement().satisfies(p -> {
				assertThat(p.status()).isEqualTo("PENDING");
				assertThat(p.memo()).contains("은행 원문 출금금액(원): -5000");
			});
			assertThat(saved.payments()).filteredOn(p -> p.amount().equals("50000")).singleElement()
			    .satisfies(p -> assertThat(p.status()).isEqualTo("CONFIRMED"));
			assertThat(cashBalances.workspace(user, property, "2026-10").bankBalance()).isEqualTo("155000");
			assertThat(count("expenses")).isZero();
			var afterBatch = service.confirmMatches(user, property);
			assertThat(afterBatch.payments()).filteredOn(p -> p.amount().equals("5000")).singleElement().satisfies(p -> {
				assertThat(p.status()).isEqualTo("PENDING");
				assertThat(p.unitId()).isEmpty();
			});
			assertThat(banking.preview(user, property, file).duplicateCount()).isEqualTo(2);
		}
	}

	@Test
	void managerCannotModifyOrDeleteChiefDirectlyOrThroughUnitDeletion() {
		UUID person = jdbc.queryForObject("select id from residents where property_id=? and name='김대표'", UUID.class,
		    property);
		jdbc.update("update residents set user_id=? where id=?", user, person);
		UUID deputy = users.saveAndFlush(User.create("부담당자", null)).getId();
		jdbc.update(
		    "insert into property_members(id,property_id,user_id,role,status,joined_at,created_at,updated_at) values (?,?,?,'MANAGER','ACTIVE',now(),now(),now())",
		    UUID.randomUUID(), property, deputy);
		var chief = residentManagement.detail(deputy, property, person);
		assertThat(chief.name()).isEqualTo("김대표");
		assertThatThrownBy(() -> residentManagement.update(deputy, property, person,
		    new com.moahome.server.resident.dto.ResidentUpdateRequest("수정 시도", unit, "OWNER", "KEEP", null, null,
		        chief.updatedAt())))
		    .isInstanceOf(AuthException.class);
		assertThatThrownBy(() -> residentManagement.delete(deputy, property, person,
		    new com.moahome.server.resident.dto.ResidentDeleteRequest(null, chief.updatedAt())))
		    .isInstanceOf(AuthException.class);
		assertThatThrownBy(
		    () -> residentManagement.deleteForUnits(deputy, property, List.of(unit), java.time.OffsetDateTime.now()))
		    .isInstanceOf(AuthException.class);
		assertThat(jdbc.queryForObject("select name from residents where id=?", String.class, person)).isEqualTo("김대표");
		assertThat(
		    jdbc.queryForObject("select deleted_at from residents where id=?", java.time.OffsetDateTime.class, person))
		    .isNull();
	}

}
