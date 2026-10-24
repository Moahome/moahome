package com.moahome.server.banking.service;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import com.moahome.server.auth.exception.*;
import com.moahome.server.banking.domain.*;
import com.moahome.server.banking.dto.*;
import com.moahome.server.banking.repo.*;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.property.service.ManagementAccessService;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@Transactional(readOnly = true)
public class BankBalanceCheckService {
	private final BankBalanceCheckRepository checks;

	private final BankAccountRepository accounts;

	private final PropertyRepository properties;

	private final ManagementAccessService access;

	private final PaymentTextSecurity security;

	private final com.moahome.server.user.repo.UserRepository users;

	private final Clock clock;

	@jakarta.persistence.PersistenceContext
	private jakarta.persistence.EntityManager entityManager;

	public BankBalanceCheckService(BankBalanceCheckRepository checks, BankAccountRepository accounts,
	    PropertyRepository properties, ManagementAccessService access, @Lazy PaymentTextSecurity security, Clock clock,
	    com.moahome.server.user.repo.UserRepository users) {
		this.checks = checks;
		this.accounts = accounts;
		this.properties = properties;
		this.users = users;
		this.access = access;
		this.security = security;
		this.clock = clock;
	}

	/** 이력은 종료 통장도 조회하되 같은 관리대상의 ADMIN과 공용 통장 소속을 매번 확인합니다. */
	private BankAccount account(UUID actor, UUID property, UUID account) {
		access.getManagementContext(actor, property);
		return accounts.findById(account)
		    .filter(a -> property.equals(a.getPropertyId()) && a.getBuildingId() == null && a.getDeletedAt() == null)
		    .orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
	}

	/** 업로드·잔고 정정과 같은 잠금을 사용해 중복 등록과 취소 상태 전이를 직렬화합니다. */
	private void lock(UUID actor, UUID property, UUID account) {
		account(actor, property, account);
		properties.findForUnitUpdate(property).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		account(actor, property, account);
	}

	private String clean(String value) {
		return value == null || value.isBlank() ? null : value.strip();
	}

	private String encrypt(String value) {
		return value == null ? null : security.protect(value).encrypted();
	}

	/** 같은 UUID 재시도는 원문을 대조하며 이미 취소된 기록을 다시 유효하게 만들지 않습니다. */
	@Transactional(isolation = Isolation.READ_COMMITTED)
	public void create(UUID actor, UUID property, BankBalanceCheckRequests.Create input) {
		lock(actor, property, input.accountId());
		String memo = clean(input.memo());
		Optional<BankBalanceCheck> repeated = checks.findById(input.id());
		if (repeated.isPresent()) {
			BankBalanceCheck row = repeated.get();
			if (!row.getPropertyId().equals(property) || !row.getBankAccountId().equals(input.accountId())
			    || !row.getCheckedBy().equals(actor)
			    || row.getBalanceAmount().compareTo(new BigDecimal(input.amount())) != 0
			    || !row.getCheckedAt().toInstant().equals(input.checkedAt().toInstant())
			    || !row.getSourceType().equals(input.sourceType())
			    || !Objects.equals(security.decrypt(row.getMemoEncrypted()), memo))
				throw new PaymentException("BANK_CHECK_CONFLICT");
			return;
		}
		if (account(actor, property, input.accountId()).getStatus() != BankAccountStatus.ACTIVE)
			throw new PaymentException("PAYMENT_ACCOUNT_UNAVAILABLE");
		if (input.checkedAt().toInstant().isAfter(clock.instant()))
			throw new PaymentException("INVALID_BANK_CHECK_TIME");
		checks.saveAndFlush(
		    BankBalanceCheck.create(input.id(), property, input.accountId(), new BigDecimal(input.amount()),
		        input.checkedAt(), input.sourceType(), actor, encrypt(memo), OffsetDateTime.now(clock)));
	}

	/** 잘못 입력한 값은 원문을 남겨 취소하고 재시도는 같은 취소 요청·관리자·사유만 허용합니다. */
	@Transactional(isolation = Isolation.READ_COMMITTED)
	public void cancel(UUID actor, UUID property, UUID id, BankBalanceCheckRequests.Cancel input) {
		BankBalanceCheck row = checks.findById(id).filter(c -> c.getPropertyId().equals(property))
		    .orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		lock(actor, property, row.getBankAccountId());
		// 잠금을 기다리는 동안 변경된 취소 상태도 DB에서 다시 읽습니다.
		entityManager.refresh(row);
		String reason = clean(input.reason());
		if (row.getCanceledAt() != null) {
			if (!input.id().equals(row.getCancelRequestId()) || !actor.equals(row.getCanceledBy())
			    || !Objects.equals(reason, security.decrypt(row.getCancelReasonEncrypted())))
				throw new PaymentException("BANK_CHECK_CONFLICT");
			return;
		}
		row.cancel(input.id(), actor, encrypt(reason), OffsetDateTime.now(clock));
		checks.flush();
	}

	/** 실제 확인시점 내림차순으로 취소 원문까지 반환하고 원문 메모는 인증된 응답에서만 복호화합니다. */
	public BankBalanceCheckResponse history(UUID actor, UUID property, UUID accountId) {
		account(actor, property, accountId);
		List<BankBalanceCheck> rows = checks.findByPropertyIdOrderByCheckedAtDescCreatedAtDesc(property).stream()
		    .filter(c -> c.getBankAccountId().equals(accountId)).toList();
		Map<UUID, String> names = new HashMap<>();
		users
		    .findAllById(rows.stream().flatMap(c -> java.util.stream.Stream.of(c.getCheckedBy(), c.getCanceledBy()))
		        .filter(Objects::nonNull).distinct().toList())
		    .forEach(u -> names.put(u.getId(), u.getDeletedAt() == null ? u.getDisplayName() : "탈퇴한 관리자"));
		return new BankBalanceCheckResponse(property, accountId,
		    rows.stream()
		        .map(c -> new BankBalanceCheckResponse.Item(c.getId(), c.getBalanceAmount().toPlainString(),
		            c.getCheckedAt(), c.getSourceType(), c.getCheckedBy(), names.getOrDefault(c.getCheckedBy(), "관리자"),
		            security.decrypt(c.getMemoEncrypted()), c.getCreatedAt(), c.getCanceledAt(), c.getCanceledBy(),
		            c.getCanceledBy() == null ? null : names.getOrDefault(c.getCanceledBy(), "관리자"),
		            security.decrypt(c.getCancelReasonEncrypted())))
		        .toList());
	}
}
