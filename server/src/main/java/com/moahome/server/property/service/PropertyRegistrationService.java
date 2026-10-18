package com.moahome.server.property.service;

import java.math.BigInteger;
import java.time.*;
import java.util.*;
import com.moahome.server.auth.exception.*;
import com.moahome.server.banking.domain.BankAccount;
import com.moahome.server.banking.repo.BankAccountRepository;
import com.moahome.server.billing.domain.*;
import com.moahome.server.billing.repo.*;
import com.moahome.server.billing.service.BillingGenerationService;
import com.moahome.server.common.security.AccountNumberSecurity;
import com.moahome.server.membership.domain.PropertyMember;
import com.moahome.server.membership.repo.PropertyMemberRepository;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.dto.*;
import com.moahome.server.property.dto.PropertyRegistrationResponse.*;
import com.moahome.server.property.exception.*;
import com.moahome.server.property.repo.*;
import com.moahome.server.user.domain.User;
import com.moahome.server.user.service.UserService;
import jakarta.validation.Validator;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
public class PropertyRegistrationService {
	private final UserService users;
	private final PropertyRepository properties;
	private final BuildingRepository buildings;
	private final UnitRepository units;
	private final BankAccountRepository bankAccounts;
	private final FeeTemplateRepository templates;
	private final FeeTemplateItemRepository items;
	private final PropertyMemberRepository members;
	private final PropertyRegistrationResultRepository results;
	private final PropertyRegistrationLock lock;
	private final AccountNumberSecurity accountSecurity;
	private final RegistrationFingerprint fingerprints;
	private final Validator validator;
	private final ObjectMapper mapper;
	private final Clock clock;
	private final BillingGenerationService billing;
	private final org.springframework.beans.factory.ObjectProvider<com.moahome.server.common.security.PhoneSecurity> phones;
	private final com.moahome.server.resident.repo.ResidentRepository residents;
	private final com.moahome.server.resident.repo.UnitResidentRepository affiliations;
	private final org.springframework.beans.factory.ObjectProvider<RegistrationOpeningService> opening;

	public PropertyRegistrationService(UserService users, PropertyRepository properties, BuildingRepository buildings,
		UnitRepository units, BankAccountRepository bankAccounts, FeeTemplateRepository templates,
		FeeTemplateItemRepository items, PropertyMemberRepository members, PropertyRegistrationResultRepository results,
		PropertyRegistrationLock lock, AccountNumberSecurity accountSecurity, RegistrationFingerprint fingerprints,
		Validator validator, ObjectMapper mapper, Clock clock, BillingGenerationService billing,
		org.springframework.beans.factory.ObjectProvider<com.moahome.server.common.security.PhoneSecurity> phones,
		com.moahome.server.resident.repo.ResidentRepository residents, com.moahome.server.resident.repo.UnitResidentRepository affiliations,
		org.springframework.beans.factory.ObjectProvider<RegistrationOpeningService> opening) {
		this.users = users;
		this.properties = properties;
		this.buildings = buildings;
		this.units = units;
		this.bankAccounts = bankAccounts;
		this.templates = templates;
		this.items = items;
		this.members = members;
		this.results = results;
		this.lock = lock;
		this.accountSecurity = accountSecurity;
		this.fingerprints = fingerprints;
		this.validator = validator;
		this.mapper = mapper;
		this.clock = clock;
		this.billing = billing;this.phones=phones;this.residents=residents;this.affiliations=affiliations;
		this.opening=opening;
	}

	/** 기본 정보만 다시 검증하고 정리한 값을 반환하며 업무 레코드와 중복 방지 ID를 생성하지 않습니다. */
	@Transactional(readOnly = true)
	public BasicInfoRequest validateBasicInfo(UUID userId, BasicInfoRequest input) {
		requireActiveUser(userId);
		validate(input);
		return input;
	}

	/** 입력 전체와 현재 계정을 검증하고 초기 설정·권한·성공 결과를 하나의 트랜잭션으로 저장합니다. */
	@Transactional(isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
	public RegistrationOutcome register(UUID userId, PropertyRegistrationRequest input) {
		User user = requireActiveUser(userId);
		validate(input);
		// 빈 성공 결과에 대한 경쟁도 막아 조회 후 생성 사이의 중복 등록을 방지합니다.
		lock.acquire(userId, input.requestId());
		var existing = results.findById(new PropertyRegistrationId(userId, input.requestId()));
		if (existing.isPresent()) {
			PropertyRegistrationResult result = existing.orElseThrow();
			requireCurrentAccess(userId, result.getPropertyId());
			if (!fingerprints.matches(result.getRequestFingerprint(), input, result.getFingerprintKeyVersion())) {
				throw new RegistrationException(RegistrationErrorCode.REGISTRATION_REQUEST_CONFLICT);
			}
			return new RegistrationOutcome(snapshot(result), false);
		}

		long monthlyAmount = validateRelationships(input);
		int creatorUnitIndex = validateAdministrator(input);
		if(input.openingBalances()!=null) opening.getObject().validate(input);
		OffsetDateTime at = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
		BasicInfoRequest basic = input.basicInfo();
		Property property = Property.create(basic.name(), basic.address(), basic.addressDetail(),
			basic.propertyType(), basic.hasBuildings(), at);
		properties.saveAndFlush(property);

		// 요청 내부 동 식별자는 저장하지 않고 생성한 동 객체로 세대 관계를 연결합니다.
		Map<String, Building> buildingMap = new LinkedHashMap<>();
		for (int index = 0; index < input.buildings().size(); index++) {
			var building = input.buildings().get(index);
			buildingMap.put(building.clientId(), Building.create(property, building.name(), index, at));
		}
		buildings.saveAllAndFlush(buildingMap.values());
		var createdUnits = units.saveAllAndFlush(input.units().stream().map(unit -> Unit.create(property,
			buildingMap.get(unit.buildingClientId()), unit.unitNumber(), unit.displayName(), unit.floor(),
			UnitStatus.valueOf(unit.status()), at)).toList());

		var createdAccounts=bankAccounts.saveAllAndFlush(input.bankAccounts().stream().map(account -> BankAccount.createPublic(property,
			account.bankCode(), account.bankName(), account.holderName(), accountSecurity.protect(account.accountNumber()),
			account.isPrimary(), at)).toList());
		FeeTemplate template = FeeTemplate.createDefault(property.getId(), at);
		templates.saveAndFlush(template);
		List<FeeTemplateItem> feeItems = new ArrayList<>();
		for (int index = 0; index < input.feeItems().size(); index++) {
			var item = input.feeItems().get(index);
			feeItems.add(FeeTemplateItem.create(template, item.itemCode(), item.itemName(), item.defaultAmount(), index, at));
		}
		items.saveAllAndFlush(feeItems);

		PropertyMember member = PropertyMember.creator(property, user, at);
		members.saveAndFlush(member);
		var creator = registerCreator(userId,property.getId(),input.administrator(),creatorUnitIndex<0?null:createdUnits.get(creatorUnitIndex),at);
		// 이전 등록은 기본 정보만 저장하고 새 최종 확인 요청은 기존 운영 시작 서비스를 같은 트랜잭션에서 실행합니다.
		var managementStart=input.openingBalances()==null?null:opening.getObject().initialize(userId,property,input,buildingMap,createdUnits,createdAccounts);
		PropertyRegistrationResponse response = new PropertyRegistrationResponse(input.requestId(),
			new PropertySummary(property.getId(), property.getName(), property.isHasBuildings(), property.getStatus().name()),
			new MembershipSummary(member.getId(), member.getRole().name(), member.getStatus().name()),
			new RegistrationSummary(buildingMap.size(), input.units().size(), input.bankAccounts().size(),
				feeItems.size(), monthlyAmount), at.toInstant(), creator,managementStart);
		String version = fingerprints.activeKeyVersion();
		// 마지막 성공 결과 저장도 실패하면 앞의 모든 flush를 함께 롤백합니다. 응답은 프록시의 커밋 이후 전달됩니다.
		results.saveAndFlush(PropertyRegistrationResult.success(userId, input.requestId(),
			fingerprints.create(input, version), version, property.getId(), mapper.writeValueAsString(response), at));
		return new RegistrationOutcome(response, true);
	}

	/** 본문은 본인의 거주 선택만 받고 로그인 계정과 역할은 서버에서 결정합니다. 선택한 세대는 같은 등록의 실제 세대여야 합니다. */
	private int validateAdministrator(PropertyRegistrationRequest input) {
		var profile=input.administrator();
		if(profile==null) return -1; // 이전 버전 제출의 호환 경로는 명부를 만들지 않습니다.
		if("EXTERNAL".equals(profile.residenceType())) {
			if(profile.name()!=null||profile.phone()!=null||profile.buildingClientId()!=null||profile.unitNumber()!=null)
				throw invalid("administrator","INVALID_COMBINATION","외부 관리소장은 거주 정보를 입력하지 않습니다.");
			return -1;
		}
		if(profile.name()==null) throw invalid("administrator.name","REQUIRED","관리소장 이름을 입력해주세요.");
		try { if (profile.phone() != null) com.moahome.server.resident.service.ResidentRegistrationService.normalizePhone(profile.phone()); }
		catch(IllegalArgumentException failure) { throw invalid("administrator.phone","INVALID_FORMAT","연락처 형식을 확인해주세요."); }
		for(int index=0;index<input.units().size();index++) {
			var unit=input.units().get(index);
			if(Objects.equals(unit.buildingClientId(),profile.buildingClientId())&&unit.unitNumber().equals(profile.unitNumber())) return index;
		}
		throw invalid("administrator.unitNumber","INVALID_REFERENCE","등록한 거주 세대를 선택해주세요.");
	}

	/** 거주 등록자는 본인 계정과 연결하되 대표로 자동 지정하지 않습니다. 선택 연락처는 있을 때만 보호해 저장합니다. */
	private CreatorSummary registerCreator(UUID actor, UUID property, PropertyRegistrationRequest.AdministratorInput input, Unit unit, OffsetDateTime at) {
		if (input == null) return null;
		if ("EXTERNAL".equals(input.residenceType())) return new CreatorSummary("EXTERNAL", null, null, null);
		String phone = input.phone() == null ? null : com.moahome.server.resident.service.ResidentRegistrationService.normalizePhone(input.phone());
		String encrypted = null;
		String hmac = null;
		String last4 = null;
		if (phone != null) {
			// 번호를 입력했을 때에만 보호 서비스를 요구하며, 보호 설정 장애에서 평문 저장으로 대체하지 않습니다.
			com.moahome.server.common.security.PhoneSecurity security;
			try { security = phones.getObject(); }
			catch (org.springframework.beans.BeansException failure) { throw new RegistrationException(RegistrationErrorCode.PHONE_SECURITY_UNAVAILABLE); }
			encrypted = security.encrypt(phone);
			hmac = security.hmac(phone);
			last4 = security.last4(phone);
		}
		var resident = com.moahome.server.resident.domain.Resident.register(UUID.randomUUID(), property, input.name(), encrypted, hmac, last4, at);
		resident.connectApprovedUser(actor, at);
		residents.saveAndFlush(resident);
		// 관리소장 등록은 일반 명부의 최초 대표 자동 지정에서 제외하고 세대 관계만 연결합니다.
		var relation = com.moahome.server.resident.domain.UnitResident.register(resident, unit, "OTHER", false, at);
		affiliations.saveAndFlush(relation);
		return new CreatorSummary("RESIDENT", resident.getId(), unit.getId(), relation.getId());
	}

	/** 제출자의 커밋된 결과만 조회하고 현재 권한을 확인한 뒤 최초 응답 스냅샷을 반환합니다. */
	@Transactional(readOnly = true)
	public PropertyRegistrationResponse getResult(UUID userId, UUID requestId) {
		requireActiveUser(userId);
		PropertyRegistrationResult result = results.findById(new PropertyRegistrationId(userId, requestId))
			.orElseThrow(() -> new RegistrationException(RegistrationErrorCode.REGISTRATION_NOT_FOUND));
		requireCurrentAccess(userId, result.getPropertyId());
		return snapshot(result);
	}

	private PropertyRegistrationResponse snapshot(PropertyRegistrationResult result) {
		return mapper.readValue(result.getResponseSnapshot(), PropertyRegistrationResponse.class);
	}

	/** 인증 계정 조회 장애를 업무 저장 장애와 구분해 기존 인증 오류 계약을 유지합니다. */
	private User requireActiveUser(UUID userId) {
		try {
			return users.requireActive(userId);
		} catch (DataAccessException exception) {
			throw new AuthException(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE);
		}
	}

	private void requireCurrentAccess(UUID userId, UUID propertyId) {
		if (!members.hasCurrentAccess(userId, propertyId)) {
			throw new AuthException(AuthErrorCode.ACCESS_DENIED);
		}
	}

	/** Controller를 거치지 않는 호출도 동일한 DTO 제약을 검증하며 입력값을 오류에 싣지 않습니다. */
	private void validate(Object input) {
		if (input == null) {
			throw new RegistrationException(RegistrationErrorCode.INVALID_REQUEST);
		}
		var violations = validator.validate(input);
		if (!violations.isEmpty()) {
			var errors = violations.stream().map(violation -> new RegistrationException.FieldError(
				violation.getPropertyPath().toString().replace(".<list element>", ""),
				violation.getMessage(), "입력 정보를 확인해주세요."))
				.sorted(Comparator.comparing(RegistrationException.FieldError::field)
					.thenComparing(RegistrationException.FieldError::reason)).toList();
			throw new RegistrationException(RegistrationErrorCode.INVALID_REQUEST, errors);
		}
	}

	/** 요청 내 소속·중복·기본 계좌 수를 검증하고 저장 범위 안에서 항목 합계를 계산합니다. */
	private long validateRelationships(PropertyRegistrationRequest input) {
		boolean hasBuildings = input.basicInfo().hasBuildings();
		if (!hasBuildings && !input.buildings().isEmpty()) {
			throw invalid("buildings", "INVALID_COMBINATION", "동 없음에서는 동 정보를 입력할 수 없습니다.");
		}
		if (hasBuildings && input.buildings().isEmpty()) {
			throw invalid("buildings", "REQUIRED", "동을 하나 이상 등록해주세요.");
		}
		Set<String> clientIds = new HashSet<>();
		Set<String> names = new HashSet<>();
		for (int index = 0; index < input.buildings().size(); index++) {
			var building = input.buildings().get(index);
			if (!clientIds.add(building.clientId())) {
				throw invalid("buildings[" + index + "].clientId", "DUPLICATE", "동 식별자가 중복됩니다.");
			}
			if (!names.add(building.name())) {
				throw invalid("buildings[" + index + "].name", "DUPLICATE", "동 이름이 중복됩니다.");
			}
		}
		Set<UnitKey> unitKeys = new HashSet<>();
		for (int index = 0; index < input.units().size(); index++) {
			var unit = input.units().get(index);
			String field = "units[" + index + "]";
			if (hasBuildings && !clientIds.contains(unit.buildingClientId())) {
				throw invalid(field + ".buildingClientId", "INVALID_REFERENCE", "등록할 동을 선택해주세요.");
			}
			if (!hasBuildings && unit.buildingClientId() != null) {
				throw invalid(field + ".buildingClientId", "INVALID_COMBINATION", "동 없음에서는 동을 선택할 수 없습니다.");
			}
			if (!unitKeys.add(new UnitKey(unit.buildingClientId(), unit.unitNumber()))) {
				throw invalid(field + ".unitNumber", "DUPLICATE", "같은 동의 세대번호가 중복됩니다.");
			}
		}
		if (input.bankAccounts().stream().filter(account -> account.isPrimary()).count() != 1) {
			throw invalid("bankAccounts", "INVALID_COMBINATION", "기본 계좌를 정확히 하나 지정해주세요.");
		}
		BigInteger total = BigInteger.ZERO;
		for (var item : input.feeItems()) {
			// 음수 항목이 중간 합계를 상쇄할 수 있으므로 전체를 정확하게 합산한 뒤 최종 범위를 검사합니다.
			total = total.add(BigInteger.valueOf(item.defaultAmount()));
		}
		BigInteger maximum = BigInteger.valueOf(PropertyRegistrationRequest.MAX_AMOUNT);
		if (total.abs().compareTo(maximum) > 0) {
			throw invalid("feeItems", "OUT_OF_RANGE", "관리비 합계가 허용 범위를 초과합니다.");
		}
		return total.longValueExact();
	}

	private RegistrationException invalid(String field, String reason, String message) {
		return RegistrationException.invalid(field, reason, message);
	}

	private record UnitKey(String buildingClientId, String unitNumber) {
	}

	public record RegistrationOutcome(PropertyRegistrationResponse response, boolean created) {
	}
}
