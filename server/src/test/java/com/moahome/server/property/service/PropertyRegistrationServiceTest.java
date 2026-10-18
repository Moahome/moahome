package com.moahome.server.property.service;

import java.time.*;
import java.util.*;
import java.util.stream.Stream;
import com.moahome.server.auth.exception.*;
import com.moahome.server.banking.domain.BankAccount;
import com.moahome.server.banking.repo.BankAccountRepository;
import com.moahome.server.billing.domain.FeeItemCode;
import com.moahome.server.billing.repo.*;
import com.moahome.server.common.security.AccountNumberSecurity;
import com.moahome.server.membership.domain.*;
import com.moahome.server.membership.repo.PropertyMemberRepository;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.dto.*;
import com.moahome.server.property.dto.PropertyRegistrationRequest.*;
import com.moahome.server.property.exception.*;
import com.moahome.server.property.repo.*;
import com.moahome.server.property.support.*;
import com.moahome.server.user.domain.*;
import com.moahome.server.user.service.UserService;
import jakarta.validation.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.*;
import org.springframework.dao.DataAccessResourceFailureException;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PropertyRegistrationServiceTest {
	private final UserService users = mock(UserService.class);
	private final PropertyRepository properties = mock(PropertyRepository.class);
	private final BuildingRepository buildings = mock(BuildingRepository.class);
	private final UnitRepository units = mock(UnitRepository.class);
	private final BankAccountRepository accounts = mock(BankAccountRepository.class);
	private final FeeTemplateRepository templates = mock(FeeTemplateRepository.class);
	private final FeeTemplateItemRepository items = mock(FeeTemplateItemRepository.class);
	private final PropertyMemberRepository members = mock(PropertyMemberRepository.class);
	private final PropertyRegistrationResultRepository results = mock(PropertyRegistrationResultRepository.class);
	private final PropertyRegistrationLock lock = mock(PropertyRegistrationLock.class);
	private final com.moahome.server.billing.service.BillingGenerationService billing = mock(com.moahome.server.billing.service.BillingGenerationService.class);
	private final ObjectMapper mapper = JsonMapper.builder().build();
	private final ValidatorFactory validation = Validation.buildDefaultValidatorFactory();
	private final User user = User.create("등록자", null);
	private final Clock clock = Clock.fixed(Instant.parse("2026-10-05T15:00:00Z"), ZoneOffset.UTC);
	private final PropertyRegistrationService service = new PropertyRegistrationService(users, properties, buildings, units,
		accounts, templates, items, members, results, lock, new AccountNumberSecurity(RegistrationTestKeys.accountProperties()),
		new RegistrationFingerprint(RegistrationTestKeys.fingerprintProperties(), mapper), validation.getValidator(), mapper, clock, billing, mock(org.springframework.beans.factory.ObjectProvider.class),
		mock(com.moahome.server.resident.repo.ResidentRepository.class),mock(com.moahome.server.resident.repo.UnitResidentRepository.class),mock(org.springframework.beans.factory.ObjectProvider.class));

	@BeforeEach void prepare() { when(users.requireActive(user.getId())).thenReturn(user); }
	@AfterEach void closeValidation() { validation.close(); }

	static Stream<Arguments> invalidRelationships() {
		var r = RegistrationFixtures.request(UUID.randomUUID(), true);
		var noBuildings = RegistrationFixtures.request(UUID.randomUUID(), false);
		return Stream.of(
			Arguments.of(change(r, r.basicInfo(), List.of(), r.units(), r.bankAccounts(), r.feeItems()), "buildings", "REQUIRED"),
			Arguments.of(change(noBuildings, noBuildings.basicInfo(), r.buildings(), noBuildings.units(),
				noBuildings.bankAccounts(), noBuildings.feeItems()), "buildings", "INVALID_COMBINATION"),
			Arguments.of(change(r, r.basicInfo(), List.of(new BuildingInput("a", "101동"), new BuildingInput("a", "102동")),
				r.units(), r.bankAccounts(), r.feeItems()), "buildings[1].clientId", "DUPLICATE"),
			Arguments.of(change(r, r.basicInfo(), List.of(new BuildingInput("a", "101동"), new BuildingInput("b", " 101동 ")),
				r.units(), r.bankAccounts(), r.feeItems()), "buildings[1].name", "DUPLICATE"),
			Arguments.of(change(r, r.basicInfo(), List.of(new BuildingInput("a", "101"), new BuildingInput("b", "101동")),
				r.units(), r.bankAccounts(), r.feeItems()), "buildings[1].name", "DUPLICATE"),
			Arguments.of(RegistrationFixtures.withUnits(r, List.of(new UnitInput("a", "101", null, null, "INACTIVE"))),
				"units[0].status", "INVALID_FORMAT"),
			Arguments.of(RegistrationFixtures.withUnits(r, List.of(new UnitInput("missing", "101", null, null, "ACTIVE"))),
				"units[0].buildingClientId", "INVALID_REFERENCE"),
			Arguments.of(RegistrationFixtures.withUnits(r, List.of(new UnitInput(null, "101", null, null, "ACTIVE"))),
				"units[0].buildingClientId", "INVALID_REFERENCE"),
			Arguments.of(RegistrationFixtures.withUnits(noBuildings, List.of(new UnitInput("a", "101", null, null, "ACTIVE"))),
				"units[0].buildingClientId", "INVALID_COMBINATION"),
			Arguments.of(RegistrationFixtures.withUnits(r, List.of(new UnitInput("a", "101", null, null, "ACTIVE"),
				new UnitInput("a", " 101 ", null, null, "VACANT"))), "units[1].unitNumber", "DUPLICATE"),
			Arguments.of(change(r, r.basicInfo(), r.buildings(), r.units(),
				List.of(new BankAccountInput("BANK", "은행", "12345678", "예금주", false)), r.feeItems()),
				"bankAccounts", "INVALID_COMBINATION"),
			Arguments.of(change(r, r.basicInfo(), r.buildings(), r.units(),
				List.of(new BankAccountInput("BANK", "은행", "12345678", "예금주", true),
					new BankAccountInput("BANK", "은행", "23456789", "예금주", true)), r.feeItems()),
				"bankAccounts", "INVALID_COMBINATION"),
			Arguments.of(change(r, r.basicInfo(), r.buildings(), r.units(), r.bankAccounts(),
				List.of(new FeeItemInput(null, "상한", PropertyRegistrationRequest.MAX_AMOUNT), new FeeItemInput(null, "초과", 1L))),
				"feeItems", "OUT_OF_RANGE"),
			Arguments.of(change(r, r.basicInfo(), r.buildings(), r.units(), r.bankAccounts(),
				List.of(new FeeItemInput(null, "하한", -PropertyRegistrationRequest.MAX_AMOUNT), new FeeItemInput(null, "초과", -1L))),
				"feeItems", "OUT_OF_RANGE"),
			Arguments.of(change(r, r.basicInfo(), r.buildings(), List.of(), r.bankAccounts(), r.feeItems()), "units", "REQUIRED"),
			Arguments.of(change(r, r.basicInfo(), r.buildings(), r.units(), List.of(), r.feeItems()), "bankAccounts", "REQUIRED"),
			Arguments.of(change(r, r.basicInfo(), r.buildings(), r.units(), r.bankAccounts(), List.of()), "feeItems", "REQUIRED"),
			Arguments.of(change(r, new BasicInfoRequest("😀".repeat(51), "주소", null, null, true), r.buildings(),
				r.units(), r.bankAccounts(), r.feeItems()), "basicInfo.name", "TOO_LONG")
		);
	}

	@ParameterizedTest
	@MethodSource("invalidRelationships")
	void rejectsInvalidInputBeforeSavingAnything(PropertyRegistrationRequest request, String field, String reason) {
		assertThatThrownBy(() -> service.register(user.getId(), request))
			.isInstanceOfSatisfying(RegistrationException.class, error -> {
				assertThat(error.code()).isEqualTo(RegistrationErrorCode.INVALID_REQUEST);
				assertThat(error.errors()).anySatisfy(detail -> {
					assertThat(detail.field()).isEqualTo(field);
					assertThat(detail.reason()).isEqualTo(reason);
				});
			});
		verifyNoInteractions(properties, buildings, units, accounts, templates, items, members);
		verify(results, never()).saveAndFlush(any());
	}

	@Test
	void acceptsSameUnitNumberAcrossDifferentBuildingsAndEmptyBuildingWithoutUnits() {
		var r = RegistrationFixtures.request(UUID.randomUUID(), true);
		var request = RegistrationFixtures.withUnits(r, List.of(new UnitInput("a", "101", null, -32768, "ACTIVE"),
			new UnitInput("b", "101", null, 32767, "VACANT")));
		assertThat(service.register(user.getId(), request).response().summary().monthlyDefaultAmount()).isEqualTo(50000);
		var member = org.mockito.ArgumentCaptor.forClass(PropertyMember.class);
		verify(members).saveAndFlush(member.capture());
		assertThat(member.getValue().getUserId()).isEqualTo(user.getId());
		assertThat(member.getValue().getRole()).isEqualTo(PropertyMemberRole.ADMIN);
		assertThat(user.getSystemRole()).isEqualTo(SystemRole.USER);
	}

	@Test
	void acceptsZeroAndExactMaximumAndDoesNotMultiplyByUnitCount() {
		var r = RegistrationFixtures.request(UUID.randomUUID(), false);
		var request = change(r, r.basicInfo(), r.buildings(), r.units(), r.bankAccounts(),
			List.of(new FeeItemInput(null, "최대", PropertyRegistrationRequest.MAX_AMOUNT), new FeeItemInput(null, "영", 0L)));
		assertThat(service.register(user.getId(), request).response().summary().monthlyDefaultAmount())
			.isEqualTo(PropertyRegistrationRequest.MAX_AMOUNT);
	}

	@Test
	void acceptsNegativeTotalsAndOffsettingItemsWithoutOrderDependentRejection() {
		var r = RegistrationFixtures.request(UUID.randomUUID(), false);
		long maximum = PropertyRegistrationRequest.MAX_AMOUNT;
		for (List<FeeItemInput> fees : List.of(
			List.of(new FeeItemInput(null, "하한", -maximum), new FeeItemInput(null, "영", 0L)),
			List.of(new FeeItemInput(null, "음수", -maximum), new FeeItemInput(null, "음수2", -maximum), new FeeItemInput(null, "상쇄", maximum)),
			List.of(new FeeItemInput(null, "양수", maximum), new FeeItemInput(null, "양수2", maximum), new FeeItemInput(null, "상쇄", -maximum)))) {
			var request = change(r, r.basicInfo(), r.buildings(), r.units(), r.bankAccounts(), fees);
			long expected = fees.stream().mapToLong(FeeItemInput::defaultAmount).sum();
			assertThat(service.register(user.getId(), request).response().summary().monthlyDefaultAmount()).isEqualTo(expected);
		}
	}

	@Test
	void accountLookupFailureUsesAuthenticationErrorAndDoesNotStartRegistration() {
		doThrow(new DataAccessResourceFailureException("private account storage")).when(users).requireActive(user.getId());
		assertThatThrownBy(() -> service.register(user.getId(), RegistrationFixtures.request(UUID.randomUUID(), false)))
			.isInstanceOfSatisfying(AuthException.class, error -> assertThat(error.code()).isEqualTo(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE));
		verifyNoInteractions(lock, results, properties);
	}

	@Test
	void fingerprintUsesNormalizedBodyArrayOrderAndStoredKeyVersionAfterRotation() {
		String oldKey = RegistrationTestKeys.randomKey();
		String newKey = RegistrationTestKeys.randomKey();
		var old = new RegistrationFingerprint(new com.moahome.server.config.RegistrationSecurityProperties("v1",
			Map.of("v1", oldKey)), mapper);
		var rotated = new RegistrationFingerprint(new com.moahome.server.config.RegistrationSecurityProperties("v2",
			Map.of("v1", oldKey, "v2", newKey)), mapper);
		var r = RegistrationFixtures.request(UUID.randomUUID(), false);
		var otherId = new PropertyRegistrationRequest(UUID.randomUUID(), r.basicInfo(), r.buildings(), r.units(),
			List.of(new BankAccountInput(" SAMPLE ", " 예시은행 ", "000 1234 5678", " 예금주 ", true)), r.feeItems());
		String fingerprint = old.create(r, "v1");
		assertThat(old.create(otherId, "v1")).isEqualTo(fingerprint);
		assertThat(rotated.matches(fingerprint, r, "v1")).isTrue();
		assertThat(rotated.create(r, "v2")).isNotEqualTo(fingerprint);
		List<FeeItemInput> reversed = new ArrayList<>(r.feeItems());
		Collections.reverse(reversed);
		assertThat(rotated.matches(fingerprint, change(r, r.basicInfo(), r.buildings(), r.units(),
			r.bankAccounts(), reversed), "v1")).isFalse();
	}

	@Test
	void feeCodesPreserveLegacyFingerprintForDirectInputAndDistinguishCodedRequests() throws Exception {
		String encodedKey = RegistrationTestKeys.randomKey();
		var fingerprints = new RegistrationFingerprint(new com.moahome.server.config.RegistrationSecurityProperties("v1",
			Map.of("v1", encodedKey)), mapper);
		var request = RegistrationFixtures.request(UUID.randomUUID(), false);
		// 필드 추가 전 성공 결과의 지문을 재현해 null 코드가 기존 재시도를 충돌로 바꾸지 않는지 확인합니다.
		var legacyFees = request.feeItems().stream().map(item -> {
			Map<String, Object> fields = new LinkedHashMap<>();
			fields.put("itemName", item.itemName());
			fields.put("defaultAmount", item.defaultAmount());
			return fields;
		}).toList();
		var mac = javax.crypto.Mac.getInstance("HmacSHA256");
		mac.init(new javax.crypto.spec.SecretKeySpec(Base64.getDecoder().decode(encodedKey), "HmacSHA256"));
		mac.update("moahome:property-registration:v1:".getBytes(java.nio.charset.StandardCharsets.UTF_8));
		String legacy = HexFormat.of().formatHex(mac.doFinal(mapper.writeValueAsBytes(List.of(request.basicInfo(),
			request.buildings(), request.units(), request.bankAccounts(), legacyFees))));
		assertThat(fingerprints.matches(legacy, request, "v1")).isTrue();
		var explicitNull = mapper.readValue(mapper.writeValueAsString(request)
			.replace("\"itemName\":", "\"itemCode\":null,\"itemName\":"), PropertyRegistrationRequest.class);
		assertThat(fingerprints.matches(legacy, explicitNull, "v1")).isTrue();
		List<FeeItemInput> coded = new ArrayList<>(request.feeItems());
		var first = coded.getFirst();
		coded.set(0, new FeeItemInput(FeeItemCode.GENERAL_MANAGEMENT, first.itemName(), first.defaultAmount()));
		var codedRequest = RegistrationFixtures.withFees(request, coded);
		assertThat(fingerprints.matches(legacy, codedRequest, "v1")).isFalse();
		String codedFingerprint = fingerprints.create(codedRequest, "v1");
		coded.set(0, new FeeItemInput(FeeItemCode.CLEANING, first.itemName(), first.defaultAmount()));
		assertThat(fingerprints.matches(codedFingerprint, RegistrationFixtures.withFees(request, coded), "v1")).isFalse();
	}

	private static PropertyRegistrationRequest change(PropertyRegistrationRequest r, BasicInfoRequest basic,
		List<BuildingInput> buildings, List<UnitInput> units, List<BankAccountInput> accounts, List<FeeItemInput> items) {
		return new PropertyRegistrationRequest(r.requestId(), basic, buildings, units, accounts, items);
	}
}
