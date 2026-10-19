package com.moahome.server.billing.service;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.stream.Collectors;
import com.moahome.server.auth.exception.*;
import com.moahome.server.banking.repo.BankAccountRepository;
import com.moahome.server.billing.domain.*;
import com.moahome.server.billing.dto.*;
import com.moahome.server.billing.repo.*;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.payment.repo.PaymentRepository;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.repo.*;
import com.moahome.server.property.service.ManagementAccessService;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class OpeningBalanceService {
	private final ManagementAccessService access;

	private final PropertyRepository properties;

	private final UnitRepository units;

	private final BuildingRepository buildings;

	private final BankAccountRepository accounts;

	private final OpeningBalanceBatchRepository batches;

	private final OpeningBalanceItemRepository items;

	private final BankOpeningBalanceRepository bankBalances;

	private final CreditApplicationRepository applications;

	private final ChargeRepository charges;

	private final PaymentRepository payments;

	private final BillingGenerationService generation;

	private final com.moahome.server.payment.service.CumulativePaymentService cumulative;

	private final PaymentTextSecurity security;

	private final Clock clock;

	public OpeningBalanceService(ManagementAccessService access, PropertyRepository properties, UnitRepository units,
	    BuildingRepository buildings, BankAccountRepository accounts, OpeningBalanceBatchRepository batches,
	    OpeningBalanceItemRepository items, BankOpeningBalanceRepository bankBalances,
	    CreditApplicationRepository applications, ChargeRepository charges, PaymentRepository payments,
	    BillingGenerationService generation, com.moahome.server.payment.service.CumulativePaymentService cumulative,
	    @Lazy PaymentTextSecurity security, Clock clock) {
		this.access = access;
		this.properties = properties;
		this.units = units;
		this.buildings = buildings;
		this.accounts = accounts;
		this.batches = batches;
		this.items = items;
		this.bankBalances = bankBalances;
		this.applications = applications;
		this.charges = charges;
		this.payments = payments;
		this.generation = generation;
		this.cumulative = cumulative;
		this.security = security;
		this.clock = clock;
	}

	private void requireAdmin(UUID actor, UUID property) {
		if (access.getManagementContext(actor, property).role() != PropertyMemberRole.ADMIN)
			throw new AuthException(AuthErrorCode.ACCESS_DENIED);
	}

	/** 스케줄·세대 변경·수납 확정과 같은 잠금으로 인계 확정과 정정을 직렬화하고 잠금 뒤 권한을 다시 검사합니다. */
	private Property lock(UUID actor, UUID property) {
		var result = properties.findForUnitUpdate(property)
		    .orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		requireAdmin(actor, property);
		return result;
	}

	public OpeningBalanceResponse workspace(UUID actor, UUID property) {
		requireAdmin(actor, property);
		return response(property);
	}

	private OpeningBalanceResponse response(UUID propertyId) {
		var property = properties.findById(propertyId).orElseThrow();
		List<OpeningBalanceBatch> history = batches.findByPropertyIdOrderByCreatedAtDesc(propertyId);
		var latest = history.stream().filter(b -> !"CANCELED".equals(b.getStatus())).findFirst().orElse(null);
		Map<UUID, OpeningBalanceItem> entries = latest == null ? Map.<UUID, OpeningBalanceItem>of()
		    : items.findByBatchId(latest.getId()).stream()
		        .collect(Collectors.toMap(OpeningBalanceItem::getUnitId, i -> i));
		Map<UUID, BankOpeningBalance> banks = latest == null ? Map.<UUID, BankOpeningBalance>of()
		    : bankBalances.findByBatchId(latest.getId()).stream()
		        .collect(Collectors.toMap(BankOpeningBalance::getBankAccountId, b -> b));
		Map<UUID, String> names = buildings.findByPropertyId(propertyId).stream()
		    .collect(Collectors.toMap(Building::getId, Building::getName));
		List<OpeningBalanceResponse.Unit> unitRows = units.findByPropertyId(propertyId).stream()
		    .filter(u -> u.getDeletedAt() == null || entries.containsKey(u.getId())).map(u -> {
			    var entry = entries.get(u.getId());
			    return new OpeningBalanceResponse.Unit(u.getId(),
			        names.getOrDefault(u.getBuildingId(), "") + " " + u.getUnitNumber() + "호",
			        entry == null ? "0" : entry.getReceivable().toPlainString(),
			        entry == null ? "0" : entry.getCredit().toPlainString(),
			        entry == null ? null : entry.getOriginMonth(),
			        entry == null ? null : security.decrypt(entry.getResponsibilityEncrypted()));
		    }).sorted(Comparator.comparing(OpeningBalanceResponse.Unit::label)).toList();
		List<OpeningBalanceResponse.Account> accountRows = accounts.findByPropertyIdAndDeletedAtIsNull(propertyId)
		    .stream()
		    .map(a -> new OpeningBalanceResponse.Account(a.getId(), a.getBankName() + " ····" + a.getAccountLast4(),
		        banks.containsKey(a.getId()) ? banks.get(a.getId()).getAmount().toPlainString() : "0"))
		    .toList();
		return new OpeningBalanceResponse(propertyId, LocalDate.now(clock.withZone(BillingCalendar.ZONE)),
		    property.getManagementStartedAt() != null, property.getBalanceCutoffDate(),
		    property.getFirstBillingMonth() == null ? null : YearMonth.from(property.getFirstBillingMonth()).toString(),
		    latest == null ? null : batchResponse(latest), unitRows, accountRows,
		    history.stream().map(this::batchResponse).toList());
	}

	private OpeningBalanceResponse.Batch batchResponse(OpeningBalanceBatch batch) {
		return new OpeningBalanceResponse.Batch(batch.getId(), batch.getRevision(), batch.getStatus(),
		    batch.getCutoffDate(), YearMonth.from(batch.getFirstBillingMonth()).toString(), batch.getConfirmedAt(),
		    batch.getCanceledAt(), batch.getCancelReason());
	}

	/** 초안만 교체 가능하며 세대·계좌 전체의 명시적인 금액으로 누락과 잘못된 다른 대상 연결을 막습니다. */
	@Transactional
	public OpeningBalanceResponse save(UUID actor, UUID propertyId, OpeningBalanceRequest input) {
		var property = lock(actor, propertyId);
		var first = BillingCalendar.parseMonth(input.firstBillingMonth());
		validateDates(property, input.cutoffDate(), first);
		var existing = batches.findByPropertyIdOrderByCreatedAtDesc(propertyId).stream()
		    .filter(b -> !"CANCELED".equals(b.getStatus())).findFirst();
		OpeningBalanceBatch batch;
		if (existing.isPresent()) {
			batch = existing.get();
			if (!"DRAFT".equals(batch.getStatus()) || !batch.getId().equals(input.batchId()) || input.revision() == null
			    || batch.getRevision() != input.revision())
				throw new PaymentException("OPENING_BALANCE_CONFLICT");
			batch.revise(input.cutoffDate(), first);
			items.deleteByBatchId(batch.getId());
			bankBalances.deleteByBatchId(batch.getId());
			items.flush();
			bankBalances.flush();
		} else {
			if (input.batchId() != null)
				throw new PaymentException("OPENING_BALANCE_CONFLICT");
			batch = batches.saveAndFlush(
			    OpeningBalanceBatch.draft(propertyId, input.cutoffDate(), first, actor, OffsetDateTime.now(clock)));
		}
		Set<UUID> currentUnits = units.findByPropertyIdAndDeletedAtIsNull(propertyId).stream().map(Unit::getId)
		    .collect(Collectors.toSet());
		if (input.units().size() != currentUnits.size() || !input.units().stream()
		    .map(OpeningBalanceRequest.UnitInput::unitId).collect(Collectors.toSet()).equals(currentUnits))
			throw new PaymentException("OPENING_TARGETS_CHANGED");
		Set<UUID> currentAccounts = accounts.findByPropertyIdAndDeletedAtIsNull(propertyId).stream().map(a -> a.getId())
		    .collect(Collectors.toSet());
		if (input.accounts().size() != currentAccounts.size() || !input.accounts().stream()
		    .map(OpeningBalanceRequest.AccountInput::accountId).collect(Collectors.toSet()).equals(currentAccounts))
			throw new PaymentException("OPENING_TARGETS_CHANGED");
		for (var entry : input.units()) {
			if (entry.originMonth() != null && !entry.originMonth().isBlank()
			    && BillingCalendar.parseMonth(entry.originMonth()).isAfter(YearMonth.from(input.cutoffDate())))
				throw new IllegalArgumentException("Invalid origin month");
			var note = com.moahome.server.common.validation.TextValues.optional(entry.responsibility(), 500);
			items
			    .save(OpeningBalanceItem.create(batch, entry.unitId(), money(entry.receivable()), money(entry.credit()),
			        entry.originMonth() == null || entry.originMonth().isBlank() ? null : entry.originMonth(),
			        note == null ? null : security.protect(note).encrypted()));
		}
		for (var account : input.accounts())
			bankBalances.save(BankOpeningBalance.create(batch, account.accountId(), money(account.amount())));
		items.flush();
		bankBalances.flush();
		batches.flush();
		return response(propertyId);
	}

	/** 기존 시스템 사용 대상에는 임의의 도입 잔액을 소급 추가하지 않습니다. 정정 시 최초 기준일·첫 부과월은 고정합니다. */
	private void validateDates(Property property, LocalDate cutoff, YearMonth first) {
		if (cutoff == null || cutoff.isAfter(LocalDate.now(clock.withZone(BillingCalendar.ZONE)))
		    || !first.atDay(1).isAfter(cutoff) || first.isAfter(BillingCalendar.currentMonth(clock).plusMonths(1)))
			throw new PaymentException("INVALID_OPENING_DATES");
		if (property.getManagementStartedAt() == null
		    && first.isBefore(YearMonth.from(property.getCreatedAt().atZoneSameInstant(BillingCalendar.ZONE))))
			throw new PaymentException("INVALID_OPENING_DATES");
		if (property.getManagementStartedAt() != null
		    && (property.getBalanceCutoffDate() == null || !property.getBalanceCutoffDate().equals(cutoff)
		        || !property.getFirstBillingMonth().equals(first.atDay(1))))
			throw new PaymentException("OPENING_BALANCE_CONFLICT");
		if (payments.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(property.getId()).stream().anyMatch(
		    p -> p.getDeletedAt() == null && "CONFIRMED".equals(p.getStatus()) && !p.getPaymentDate().isAfter(cutoff)))
			throw new PaymentException("OPENING_ALREADY_HAS_RECEIPTS");
	}

	/** 인계와 운영 개시·첫 부과·선납 충당을 함께 확정하며 실패하면 어떤 단계도 남기지 않습니다. */
	@Transactional
	public OpeningBalanceResponse confirm(UUID actor, UUID propertyId, UUID batchId, long revision) {
		var property = lock(actor, propertyId);
		var batch = required(propertyId, batchId);
		if ("CONFIRMED".equals(batch.getStatus()))
			return response(propertyId);
		if (!"DRAFT".equals(batch.getStatus()) || batch.getRevision() != revision)
			throw new PaymentException("OPENING_BALANCE_CONFLICT");
		var first = YearMonth.from(batch.getFirstBillingMonth());
		validateDates(property, batch.getCutoffDate(), first);
		List<OpeningBalanceItem> entryRows = items.findByBatchId(batchId);
		Map<UUID, Unit> live = units.findByPropertyIdAndDeletedAtIsNull(propertyId).stream()
		    .collect(Collectors.toMap(Unit::getId, u -> u));
		if (!entryRows.stream().map(OpeningBalanceItem::getUnitId).collect(Collectors.toSet()).equals(live.keySet()))
			throw new PaymentException("OPENING_TARGETS_CHANGED");
		Set<UUID> liveAccounts = accounts.findByPropertyIdAndDeletedAtIsNull(propertyId).stream().map(a -> a.getId())
		    .collect(Collectors.toSet());
		if (!bankBalances.findByBatchId(batchId).stream().map(BankOpeningBalance::getBankAccountId)
		    .collect(Collectors.toSet()).equals(liveAccounts))
			throw new PaymentException("OPENING_TARGETS_CHANGED");
		Map<UUID, String> names = buildings.findByPropertyId(propertyId).stream()
		    .collect(Collectors.toMap(Building::getId, Building::getName));
		var at = OffsetDateTime.now(clock);
		batch.confirm(actor, at);
		for (var entry : entryRows) {
			if (entry.getReceivable().signum() == 0)
				continue;
			var unit = live.get(entry.getUnitId());
			var charge = charges.saveAndFlush(Charge.opening(propertyId, unit,
			    names.getOrDefault(unit.getBuildingId(), ""), entry.getReceivable(), batch.getCutoffDate(), at));
			entry.connectReceivable(charge);
		}
		if (property.getManagementStartedAt() == null)
			property.startManagement(batch.getCutoffDate(), first, at);
		properties.flush();
		items.flush();
		batches.flush();
		// 과거 월 전체를 재생성하지 않고 선택한 첫 월만 생성합니다. 이후 누락 월 복구는 기존 스케줄이 담당합니다.
		if (!first.isAfter(BillingCalendar.currentMonth(clock)))
			generation.generate(propertyId, first);
		cumulative.settle(propertyId, actor);
		return response(propertyId);
	}

	/** 실제 수납이 하나라도 확정된 뒤에는 잔액 재인계를 막고, 사용 전 정정만 취소 이력과 함께 허용합니다. */
	@Transactional
	public OpeningBalanceResponse cancel(UUID actor, UUID propertyId, UUID batchId,
	    OpeningBalanceRequest.Cancel input) {
		lock(actor, propertyId);
		var batch = required(propertyId, batchId);
		if ("CANCELED".equals(batch.getStatus()))
			return response(propertyId);
		if (batch.getRevision() != input.revision() || !"CONFIRMED".equals(batch.getStatus()))
			throw new PaymentException("OPENING_BALANCE_CONFLICT");
		if (payments.findByPropertyIdOrderByPaymentDateDescCreatedAtDesc(propertyId).stream()
		    .anyMatch(p -> "CONFIRMED".equals(p.getStatus())))
			throw new PaymentException("OPENING_ALREADY_HAS_RECEIPTS");
		Set<UUID> rowIds = items.findByBatchId(batchId).stream().map(OpeningBalanceItem::getId)
		    .collect(Collectors.toSet());
		applications.findByPropertyId(propertyId).stream().filter(a -> rowIds.contains(a.getOpeningItemId()))
		    .forEach(CreditApplication::cancel);
		applications.flush();
		var at = OffsetDateTime.now(clock);
		items.findByBatchId(batchId).stream().map(OpeningBalanceItem::getChargeId).filter(Objects::nonNull)
		    .forEach(id -> charges.findById(id).orElseThrow().cancelOpening(actor, at));
		charges.flush();
		batch.cancel(actor, input.reason(), at);
		batches.flush();
		return response(propertyId);
	}

	private OpeningBalanceBatch required(UUID property, UUID id) {
		return batches.findById(id).filter(b -> property.equals(b.getPropertyId()))
		    .orElseThrow(() -> new PaymentException("OPENING_NOT_FOUND"));
	}

	private BigDecimal money(String amount) {
		if (amount == null || !amount.matches("[0-9]{1,15}"))
			throw new IllegalArgumentException("Invalid opening amount");
		return new BigDecimal(amount);
	}
}
