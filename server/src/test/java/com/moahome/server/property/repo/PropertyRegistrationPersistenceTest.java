package com.moahome.server.property.repo;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

import jakarta.validation.*;
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
import org.springframework.context.annotation.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import com.moahome.server.auth.exception.*;
import com.moahome.server.auth.support.MutableClock;
import com.moahome.server.billing.domain.FeeItemCode;
import com.moahome.server.billing.domain.FeeTemplateItem;
import com.moahome.server.billing.repo.FeeTemplateItemRepository;
import com.moahome.server.billing.service.BillingGenerationService;
import com.moahome.server.billing.service.BillingTemplates;
import com.moahome.server.common.security.AccountNumberSecurity;
import com.moahome.server.common.security.PhoneSecurity;
import com.moahome.server.config.PhoneSecurityProperties;
import com.moahome.server.payment.service.CumulativePaymentService;
import com.moahome.server.property.dto.*;
import com.moahome.server.property.exception.*;
import com.moahome.server.property.service.*;
import com.moahome.server.property.support.*;
import com.moahome.server.resident.repo.ResidentRepository;
import com.moahome.server.user.domain.*;
import com.moahome.server.user.repo.UserRepository;
import com.moahome.server.user.service.UserService;
import com.moahome.server.user.support.PostgresTestServer;

import static org.assertj.core.api.Assertions.*;

@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(FlywayAutoConfiguration.class)
@Import({ CumulativePaymentService.class, PropertyRegistrationService.class,
        PropertyRegistrationLock.class, UserService.class, PropertyRegistrationPersistenceTest.TestBeans.class,
        BillingGenerationService.class,
        BillingTemplates.class })
@ActiveProfiles("database-test")
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class PropertyRegistrationPersistenceTest {
	private static final PostgresTestServer POSTGRES = new PostgresTestServer();

	private static final List<String> TABLES = List.of("unit_residents", "residents", "charge_items", "charges",
	    "billing_periods", "property_registration_results", "property_members", "fee_template_items", "fee_templates",
	    "bank_accounts", "units", "buildings", "properties");

	@Autowired
	PropertyRegistrationService registrations;

	@Autowired
	PropertyRegistrationLock lock;

	@Autowired
	UserRepository users;

	@Autowired
	FeeTemplateItemRepository feeItems;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	Flyway flyway;

	@Autowired
	AccountNumberSecurity accountSecurity;

	@Autowired
	PhoneSecurity phoneSecurity;

	@Autowired
	ResidentRepository residents;

	@Autowired
	ObjectMapper mapper;

	@Autowired
	MutableClock clock;

	@Autowired
	PlatformTransactionManager transactions;

	private UUID userId;

	@DynamicPropertySource
	static void infrastructure(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", POSTGRES::jdbcUrl);
		registry.add("spring.datasource.username", POSTGRES::username);
		registry.add("spring.datasource.password", () -> "");
	}

	@BeforeEach
	void prepare() {
		clock.set(Instant.parse("2026-10-05T15:00:00Z"));
		userId = users.saveAndFlush(User.create("등록자", null)).getId();
	}

	@AfterEach
	void cleanRows() {
		jdbc.execute("drop function if exists fail_registration() cascade");
		for (String table : TABLES) {
			jdbc.update("delete from " + table);
		}
		jdbc.update("delete from social_accounts");
		jdbc.update("delete from users");
	}

	@AfterAll
	static void stopPostgres() {
		POSTGRES.close();
	}

	/** 첫 등록자의 거주 선택은 추가 가입 요청 없이 본인 명부·계정 연결과 ADMIN을 저장하고 대표로 지정하지 않습니다. */
	@ParameterizedTest
	@ValueSource(booleans = { false, true })
	void residentCreatorIsImmediatelyLinkedOnceWithProtectedPhone(boolean hasBuildings) {
		var original = RegistrationFixtures.request(UUID.randomUUID(), hasBuildings);
		var profile = new PropertyRegistrationRequest.AdministratorInput("RESIDENT", "실제 관리소장", "010-1234-5678",
		    hasBuildings ? "a" : null, "201");
		var request = withAdministrator(original, profile);
		var result = registrations.register(userId, request);
		var creator = result.response().administrator();
		assertThat(creator.residenceType()).isEqualTo("RESIDENT");
		Map<String, Object> resident = jdbc.queryForMap("select * from residents where id=?", creator.residentId());
		assertThat(resident.get("user_id")).isEqualTo(userId);
		assertThat(resident.get("name")).isEqualTo("실제 관리소장");
		assertThat(resident.get("phone_last4")).isEqualTo("5678");
		assertThat(phoneSecurity.decrypt((String) resident.get("phone_encrypted"))).isEqualTo("+821012345678");
		assertThat(jdbc.queryForObject("select is_household_rep from unit_residents where id=?", Boolean.class,
		    creator.unitResidentId())).isFalse();
		assertThat(residents.findDirectory(result.response().property().id())).singleElement().satisfies(row -> {
			assertThat(row.getApproved()).isTrue();
			assertThat(row.getServiceRole()).isEqualTo("ADMIN");
		});
		assertThat(count("membership_requests")).isZero();
		assertThat(count("property_members")).isEqualTo(1);
		assertThat(registrations.register(userId, request).created()).isFalse();
		assertThat(count("residents")).isEqualTo(1);
		assertThat(registrations.getResult(userId, request.requestId()).administrator()).isEqualTo(creator);
		assertThat(
		    jdbc.queryForObject("select response_snapshot::text from property_registration_results", String.class))
		    .doesNotContain("010-1234", "+821012345678", "실제 관리소장");
		var changed = withAdministrator(original,
		    new PropertyRegistrationRequest.AdministratorInput("EXTERNAL", null, null, null, null));
		assertCode(() -> registrations.register(userId, changed), RegistrationErrorCode.REGISTRATION_REQUEST_CONFLICT);
		// 과거 등록의 자동 연결은 원래 세대 관계에만 적용해 재입주 관계를 자동 승인하지 않습니다.
		jdbc.update("update unit_residents set id=? where id=?", UUID.randomUUID(), creator.unitResidentId());
		assertThat(residents.findDirectory(result.response().property().id()).getFirst().getApproved()).isFalse();
	}

	@Test
	void externalCreatorCreatesOnlyAdminMembership() {
		var request = withAdministrator(RegistrationFixtures.request(UUID.randomUUID(), false),
		    new PropertyRegistrationRequest.AdministratorInput("EXTERNAL", null, null, null, null));
		var response = registrations.register(userId, request).response();
		assertThat(response.administrator().residenceType()).isEqualTo("EXTERNAL");
		assertThat(response.administrator().residentId()).isNull();
		assertThat(count("residents")).isZero();
		assertThat(count("unit_residents")).isZero();
		assertThat(count("property_members")).isEqualTo(1);
	}

	@Test
	void invalidCreatorResidenceOrPhoneDoesNotCreatePartialRegistration() {
		var original = RegistrationFixtures.request(UUID.randomUUID(), false);
		for (var profile : List.of(
		    new PropertyRegistrationRequest.AdministratorInput("RESIDENT", "관리소장", "010-1234-5678", null, "없는호수"),
		    new PropertyRegistrationRequest.AdministratorInput("RESIDENT", "관리소장", "invalid", null, "201"),
		    new PropertyRegistrationRequest.AdministratorInput("EXTERNAL", "다른사람", null, null, null))) {
			assertCode(() -> registrations.register(userId, withAdministrator(original, profile)),
			    RegistrationErrorCode.INVALID_REQUEST);
			for (String table : TABLES)
				assertThat(count(table)).as(table).isZero();
		}
	}

	@Test
	void residentCreatorWithoutContactStoresNullPhoneAndIsNotRepresentative() {
		var request = withAdministrator(RegistrationFixtures.request(UUID.randomUUID(), false),
		    new PropertyRegistrationRequest.AdministratorInput("RESIDENT", "관리소장", null, null, "201"));
		var result = registrations.register(userId, request).response();
		var creator = result.administrator();
		Map<String, Object> resident = jdbc.queryForMap("select * from residents where id=?", creator.residentId());
		assertThat(resident.get("phone_encrypted")).isNull();
		assertThat(resident.get("phone_hmac")).isNull();
		assertThat(resident.get("phone_last4")).isNull();
		assertThat(resident.get("user_id")).isEqualTo(userId);
		assertThat(jdbc.queryForObject("select is_household_rep from unit_residents where id=?", Boolean.class,
		    creator.unitResidentId())).isFalse();
		assertThat(jdbc.queryForObject("select role from property_members where property_id=? and user_id=?",
		    String.class, result.property().id(), userId)).isEqualTo("ADMIN");
	}

	@Test
	void creatorDirectoryRollsBackWhenFinalRegistrationResultFails() {
		jdbc.execute(
		    "create function fail_registration() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$");
		jdbc.execute(
		    "create trigger fail_registration_result before insert on property_registration_results for each row execute function fail_registration()");
		var request = withAdministrator(RegistrationFixtures.request(UUID.randomUUID(), false),
		    new PropertyRegistrationRequest.AdministratorInput("RESIDENT", "관리소장", "010-1234-5678", null, "201"));
		assertThatThrownBy(() -> registrations.register(userId, request)).isInstanceOf(RuntimeException.class);
		for (String table : TABLES)
			assertThat(count(table)).as(table).isZero();
	}

	private PropertyRegistrationRequest withAdministrator(PropertyRegistrationRequest request,
	    PropertyRegistrationRequest.AdministratorInput profile) {
		return new PropertyRegistrationRequest(request.requestId(), request.basicInfo(), request.buildings(),
		    request.units(), request.bankAccounts(), request.feeItems(), profile);
	}

	@ParameterizedTest
	@ValueSource(booleans = { false, true })
	void savesWholeRegistrationWithExactDefaultsAndProtectedAccount(boolean hasBuildings) {
		var request = RegistrationFixtures.request(UUID.randomUUID(), hasBuildings);
		var outcome = registrations.register(userId, request);
		assertThat(outcome.created()).isTrue();
		assertThat(outcome.response().summary().monthlyDefaultAmount()).isEqualTo(50000);
		assertThat(outcome.response().membership().role()).isEqualTo("ADMIN");
		assertThat(outcome.response().createdAt()).isEqualTo(clock.instant());
		assertThat(count("properties")).isEqualTo(1);
		assertThat(count("buildings")).isEqualTo(hasBuildings ? 2 : 0);
		assertThat(count("units")).isEqualTo(2);
		assertThat(count("bank_accounts")).isEqualTo(1);
		assertThat(count("fee_templates")).isEqualTo(1);
		assertThat(count("fee_template_items")).isEqualTo(4);
		assertThat(count("property_members")).isEqualTo(1);
		assertThat(count("property_registration_results")).isEqualTo(1);
		assertThat(count("billing_periods")).isZero();
		assertThat(count("charges")).isZero();
		assertThat(count("charge_items")).isZero();
		assertThat(jdbc.queryForObject("select management_started_at from properties", Timestamp.class))
		    .isNull();
		Map<String, Object> account = jdbc.queryForMap("select * from bank_accounts");
		assertThat(account.get("building_id")).isNull();
		assertThat(account.get("holder_resident_id")).isNull();
		assertThat(account.get("gl_account_id")).isNull();
		assertThat(account.get("is_primary")).isEqualTo(true);
		assertThat(account.get("valid_from").toString()).isEqualTo("2026-10-06");
		assertThat(accountSecurity.decrypt((String) account.get("account_number_encrypted"))).isEqualTo("00012345678");
		assertThat(account.get("account_number_hmac").toString()).hasSize(64);
		assertThat(account.get("account_last4")).isEqualTo("5678");
		assertThat(jdbc.queryForObject("select holder_name_snapshot from bank_accounts", String.class))
		    .isEqualTo("예금주");
		assertThat(jdbc.queryForList("select sort_order from fee_template_items order by sort_order", Integer.class))
		    .containsExactly(0, 1, 2, 3);
		assertThat(jdbc.queryForObject("select name from fee_templates", String.class)).isEqualTo("기본 관리비");
		assertThat(jdbc.queryForObject("select system_role from users where id = ?", String.class, userId))
		    .isEqualTo("USER");
		assertThat(jdbc.queryForObject("select count(*) from units where building_id is null", Integer.class))
		    .isEqualTo(hasBuildings ? 0 : 2);
		String snapshot = jdbc.queryForObject("select response_snapshot::text from property_registration_results",
		    String.class);
		assertThat(snapshot).doesNotContain("00012345678", "예금주", "accountNumber", "holderName");
		assertThat(registrations.getResult(userId, request.requestId())).isEqualTo(outcome.response());
	}

	@Test
	void storesRecommendedCodesAsVarcharAndReloadsEnumsAlongsideDirectInput() {
		List<PropertyRegistrationRequest.FeeItemInput> inputs = new ArrayList<>();
		for (FeeItemCode code : FeeItemCode.values()) {
			inputs.add(new PropertyRegistrationRequest.FeeItemInput(code, "종류와 독립된 이름 " + inputs.size(), 1000L));
		}
		inputs.add(new PropertyRegistrationRequest.FeeItemInput(null, "공용 인터넷 이용료", 500L));
		var request = RegistrationFixtures.withFees(RegistrationFixtures.request(UUID.randomUUID(), false), inputs);
		var first = registrations.register(userId, request);
		List<String> expectedCodes = new ArrayList<>(Arrays.stream(FeeItemCode.values()).map(Enum::name).toList());
		expectedCodes.add(null);
		assertThat(jdbc.queryForList("select item_code from fee_template_items order by sort_order", String.class))
		    .containsExactlyElementsOf(expectedCodes);
		assertThat(jdbc.queryForObject("select data_type from information_schema.columns where table_schema = 'public' "
		    + "and table_name = 'fee_template_items' and column_name = 'item_code'", String.class))
		    .isEqualTo("character varying");
		List<FeeTemplateItem> reloaded = feeItems.findAll().stream()
		    .sorted(Comparator.comparingInt(FeeTemplateItem::getSortOrder)).toList();
		assertThat(reloaded).extracting(FeeTemplateItem::getItemCode).containsExactlyElementsOf(
		    inputs.stream().map(PropertyRegistrationRequest.FeeItemInput::itemCode).toList());
		assertThat(reloaded).extracting(FeeTemplateItem::getItemName).containsExactlyElementsOf(
		    inputs.stream().map(PropertyRegistrationRequest.FeeItemInput::itemName).toList());
		assertThat(registrations.register(userId, request).created()).isFalse();
		assertThat(registrations.getResult(userId, request.requestId())).isEqualTo(first.response());
		List<PropertyRegistrationRequest.FeeItemInput> changed = new ArrayList<>(inputs);
		var original = changed.getFirst();
		changed.set(0, new PropertyRegistrationRequest.FeeItemInput(FeeItemCode.CLEANING, original.itemName(),
		    original.defaultAmount()));
		assertCode(() -> registrations.register(userId, RegistrationFixtures.withFees(request, changed)),
		    RegistrationErrorCode.REGISTRATION_REQUEST_CONFLICT);
		assertThat(count("fee_template_items")).isEqualTo(inputs.size());
	}

	@Test
	void savesNegativeFeeAndSignedTotalInDatabaseAndResultSnapshot() {
		var r = RegistrationFixtures.request(UUID.randomUUID(), false);
		var request = new PropertyRegistrationRequest(r.requestId(), r.basicInfo(), r.buildings(), r.units(),
		    r.bankAccounts(), List.of(new PropertyRegistrationRequest.FeeItemInput(null, "차감", -15000L),
		        new PropertyRegistrationRequest.FeeItemInput(null, "영", 0L)));
		var outcome = registrations.register(userId, request);
		assertThat(outcome.response().summary().monthlyDefaultAmount()).isEqualTo(-15000);
		assertThat(jdbc.queryForList("select default_amount from fee_template_items order by sort_order",
		    BigDecimal.class)).containsExactly(new BigDecimal("-15000"), BigDecimal.ZERO);
		assertThat(registrations.getResult(userId, request.requestId())).isEqualTo(outcome.response());
	}

	@Test
	void basicValidationNeverPersistsBusinessData() {
		for (int index = 0; index < 3; index++) {
			assertThat(
			    registrations.validateBasicInfo(userId, new BasicInfoRequest(" 이름 ", " 주소 ", " ", null, false)).name())
			    .isEqualTo("이름");
		}
		assertThatThrownBy(
		    () -> registrations.validateBasicInfo(userId, new BasicInfoRequest(" ", "주소", null, null, false)))
		    .isInstanceOf(RegistrationException.class);
		for (String table : TABLES) {
			assertThat(count(table)).as(table).isZero();
		}
	}

	@ParameterizedTest
	@ValueSource(strings = { "properties", "buildings", "units", "bank_accounts", "fee_templates", "fee_template_items",
	        "property_members", "property_registration_results" })
	void rollsBackEveryTableAndAllowsSameIdRetryWhenAnySaveFails(String table) {
		jdbc.execute("create function fail_registration() returns trigger language plpgsql as $$ "
		    + "begin raise exception 'test registration failure'; end; $$");
		jdbc.execute("create trigger fail_registration before insert on " + table
		    + " for each row execute function fail_registration()");
		var request = RegistrationFixtures.request(UUID.randomUUID(), true);
		assertThatThrownBy(() -> registrations.register(userId, request)).isInstanceOf(RuntimeException.class);
		for (String name : TABLES) {
			assertThat(count(name)).as(name).isZero();
		}
		assertCode(() -> registrations.getResult(userId, request.requestId()),
		    RegistrationErrorCode.REGISTRATION_NOT_FOUND);
		jdbc.execute("drop function fail_registration() cascade");
		assertThat(registrations.register(userId, request).created()).isTrue();
	}

	@Test
	void retriesAndGetPreserveOriginalSnapshotAndDateAfterDataChangesAndKeyScopedConflict() {
		var request = RegistrationFixtures.request(UUID.randomUUID(), true);
		var first = registrations.register(userId, request);
		jdbc.update("update properties set name = '변경된 이름' where id = ?", first.response().property().id());
		jdbc.update("update property_members set role = 'MANAGER' where id = ?", first.response().membership().id());
		clock.set(Instant.parse("2026-10-07T00:00:00Z"));
		assertThat(registrations.register(userId, request).created()).isFalse();
		assertThat(registrations.register(userId, request).response()).isEqualTo(first.response());
		assertThat(registrations.getResult(userId, request.requestId())).isEqualTo(first.response());
		assertThat(jdbc.queryForObject("select valid_from from bank_accounts", Date.class).toString())
		    .isEqualTo("2026-10-06");
		var changed = new PropertyRegistrationRequest(request.requestId(), request.basicInfo(), request.buildings(),
		    request.units(), request.bankAccounts(),
		    List.of(new PropertyRegistrationRequest.FeeItemInput(null, "다름", 1L)));
		assertCode(() -> registrations.register(userId, changed), RegistrationErrorCode.REGISTRATION_REQUEST_CONFLICT);
		assertThat(count("properties")).isEqualTo(1);
	}

	@Test
	void otherUsersCannotReadResultAndSameRequestIdForAnotherUserCreatesSeparateProperty() {
		var request = RegistrationFixtures.request(UUID.randomUUID(), false);
		registrations.register(userId, request);
		UUID other = users.saveAndFlush(User.create("다른 등록자", null)).getId();
		assertCode(() -> registrations.getResult(other, request.requestId()),
		    RegistrationErrorCode.REGISTRATION_NOT_FOUND);
		assertThat(registrations.register(other, request).created()).isTrue();
		assertThat(count("properties")).isEqualTo(2);
		jdbc.update("update property_members set status = 'INACTIVE' where user_id = ?", userId);
		assertThatThrownBy(() -> registrations.getResult(userId, request.requestId())).isInstanceOfSatisfying(
		    AuthException.class, error -> assertThat(error.code()).isEqualTo(AuthErrorCode.ACCESS_DENIED));
		assertThatThrownBy(() -> registrations.register(userId, request)).isInstanceOfSatisfying(AuthException.class,
		    error -> assertThat(error.code()).isEqualTo(AuthErrorCode.ACCESS_DENIED));
	}

	@Test
	void concurrentSameRequestsCommitExactlyOneRegistration() throws Exception {
		var request = RegistrationFixtures.request(UUID.randomUUID(), true);
		CountDownLatch ready = new CountDownLatch(2);
		CountDownLatch start = new CountDownLatch(1);
		Callable<PropertyRegistrationService.RegistrationOutcome> task = () -> {
			ready.countDown();
			assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
			return registrations.register(userId, request);
		};
		try (var executor = Executors.newFixedThreadPool(2)) {
			var first = executor.submit(task);
			var second = executor.submit(task);
			assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
			start.countDown();
			var a = first.get(10, TimeUnit.SECONDS);
			var b = second.get(10, TimeUnit.SECONDS);
			assertThat(List.of(a.created(), b.created())).containsExactlyInAnyOrder(true, false);
			assertThat(a.response()).isEqualTo(b.response());
		}
		assertThat(count("properties")).isEqualTo(1);
		assertThat(count("property_registration_results")).isEqualTo(1);
	}

	@Test
	void lockTimeoutReportsInProgressAndGetSeesOnlyCommittedResults() throws Exception {
		var request = RegistrationFixtures.request(UUID.randomUUID(), false);
		CountDownLatch locked = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		try (var executor = Executors.newSingleThreadExecutor()) {
			var held = executor.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
				lock.acquire(userId, request.requestId());
				locked.countDown();
				try {
					assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
				} catch (InterruptedException exception) {
					Thread.currentThread().interrupt();
					throw new IllegalStateException(exception);
				}
			}));
			try {
				assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue();
				assertCode(() -> registrations.getResult(userId, request.requestId()),
				    RegistrationErrorCode.REGISTRATION_NOT_FOUND);
				assertCode(() -> registrations.register(userId, request),
				    RegistrationErrorCode.REGISTRATION_IN_PROGRESS);
				assertThat(count("properties")).isZero();
			} finally {
				release.countDown();
			}
			held.get(5, TimeUnit.SECONDS);
		}
		assertThat(registrations.register(userId, request).created()).isTrue();
	}

	@Test
	void databaseRejectsCrossPropertyBuildingsDuplicatesAndInvalidMoney() {
		var first = registrations.register(userId, RegistrationFixtures.request(UUID.randomUUID(), true));
		var second = registrations.register(userId, RegistrationFixtures.request(UUID.randomUUID(), false));
		UUID foreignBuilding = jdbc.queryForObject(
		    "select id from buildings where property_id = ? order by sort_order limit 1", UUID.class,
		    first.response().property().id());
		assertThatThrownBy(() -> jdbc.update("update units set building_id = ? where property_id = ?", foreignBuilding,
		    second.response().property().id())).isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> jdbc.update("update buildings set name = '101동' where name = '102동'"))
		    .isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> jdbc.update("update units set unit_number = '201' where property_id = ?",
		    second.response().property().id())).isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> jdbc.update("update fee_template_items set default_amount = -1000000000000000"))
		    .isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> jdbc.update("update property_members set role = 'PLATFORM_ADMIN'"))
		    .isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> jdbc.update("update bank_accounts set account_last4 = 'xxxx'"))
		    .isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void upgradesExistingFeeRowsAndAllowsNegativeAmountsAfterMigration() {
		String schema = "signed_fees_" + UUID.randomUUID().toString().replace("-", "");
		Flyway old = Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "").schemas(schema)
		    .defaultSchema(schema).target("20261005034120").load();
		old.migrate();
		UUID propertyId = UUID.randomUUID();
		UUID templateId = UUID.randomUUID();
		UUID itemId = UUID.randomUUID();
		jdbc.update(
		    "insert into " + schema + ".properties (id,name,address,has_buildings,status,created_at,updated_at) "
		        + "values (?,'기존 대상','주소',false,'ACTIVE',now(),now())",
		    propertyId);
		jdbc.update(
		    "insert into " + schema + ".fee_templates (id,property_id,name,is_default,status,created_at,updated_at) "
		        + "values (?,?,'기본 관리비',true,'ACTIVE',now(),now())",
		    templateId, propertyId);
		jdbc.update("insert into " + schema
		    + ".fee_template_items (id,fee_template_id,item_name,default_amount,sort_order,is_active,created_at,updated_at) "
		    + "values (?,?,'기존 항목',15000,0,true,now(),now())", itemId, templateId);
		assertThatThrownBy(() -> jdbc.update("update " + schema + ".fee_template_items set default_amount=-1"))
		    .isInstanceOf(DataIntegrityViolationException.class);
		Flyway upgraded = Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "").schemas(schema)
		    .defaultSchema(schema).load();
		int pendingMigrations = upgraded.info().pending().length;
		assertThat(pendingMigrations).isPositive();
		assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(pendingMigrations);
		upgraded.validate();
		assertThat(jdbc.queryForObject("select default_amount from " + schema + ".fee_template_items where id=?",
		    Long.class, itemId)).isEqualTo(15000);
		assertThat(jdbc.update("update " + schema + ".fee_template_items set default_amount=-1 where id=?", itemId))
		    .isEqualTo(1);
		assertThat(jdbc.queryForObject("select default_amount from " + schema + ".fee_template_items where id=?",
		    Long.class, itemId)).isEqualTo(-1);
	}

	@Test
	void migratesEmptyAndExistingUserSchemaWithoutChangingIdentity() {
		flyway.validate();
		assertThat(flyway.info().applied()).hasSize(flyway.info().all().length);
		assertThat(flyway.info().pending()).isEmpty();
		assertThat(flyway.migrate().migrationsExecuted).isZero();
		String schema = "registration_" + UUID.randomUUID().toString().replace("-", "");
		Flyway old = Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "").schemas(schema)
		    .defaultSchema(schema).target("20261003111256").load();
		old.migrate();
		UUID legacyId = UUID.randomUUID();
		jdbc.update("insert into " + schema + ".users (id, display_name, status) values (?, '기존 사용자', 'ACTIVE')",
		    legacyId);
		Flyway upgraded = Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "").schemas(schema)
		    .defaultSchema(schema).load();
		int pendingMigrations = upgraded.info().pending().length;
		assertThat(pendingMigrations).isPositive();
		assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(pendingMigrations);
		upgraded.validate();
		assertThat(
		    jdbc.queryForObject("select system_role from " + schema + ".users where id = ?", String.class, legacyId))
		    .isEqualTo("USER");
		assertThat(jdbc.queryForObject("select count(*) from " + schema + ".properties", Integer.class)).isZero();
	}

	private long count(String table) {
		return jdbc.queryForObject("select count(*) from " + table, Long.class);
	}

	private void assertCode(Runnable action, RegistrationErrorCode code) {
		assertThatThrownBy(action::run).isInstanceOfSatisfying(RegistrationException.class,
		    error -> assertThat(error.code()).isEqualTo(code));
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
		PhoneSecurity phoneSecurity() {
			return new PhoneSecurity(
			    new PhoneSecurityProperties("v1",
			        Map.of("v1", RegistrationTestKeys.randomKey()), RegistrationTestKeys.randomKey()));
		}

		@Bean
		AccountNumberSecurity accountSecurity() {
			return new AccountNumberSecurity(RegistrationTestKeys.accountProperties());
		}

		@Bean
		RegistrationFingerprint fingerprints(ObjectMapper mapper) {
			return new RegistrationFingerprint(RegistrationTestKeys.fingerprintProperties(), mapper);
		}
	}
}
