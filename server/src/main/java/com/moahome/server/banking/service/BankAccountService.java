package com.moahome.server.banking.service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import org.springframework.context.annotation.Lazy;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.banking.domain.BankAccount;
import com.moahome.server.banking.domain.BankAccountStatus;
import com.moahome.server.banking.dto.BankAccountSettings;
import com.moahome.server.banking.repo.BankAccountRepository;
import com.moahome.server.common.security.AccountNumberSecurity;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.property.service.ManagementAccessService;

@Service
@Profile("!test")
@Transactional(readOnly = true)
public class BankAccountService {
	private final ManagementAccessService access;

	private final PropertyRepository properties;

	private final BankAccountRepository accounts;

	private final AccountNumberSecurity security;

	private final Clock clock;

	public BankAccountService(ManagementAccessService access, PropertyRepository properties,
	    BankAccountRepository accounts, @Lazy AccountNumberSecurity security, Clock clock) {
		this.access = access;
		this.properties = properties;
		this.accounts = accounts;
		this.security = security;
		this.clock = clock;
	}

	/** 계좌번호 원문은 현재 관리자 권한을 확인한 조회에서만 복호화합니다. */
	public BankAccountSettings.Response read(UUID userId, UUID propertyId) {
		requireManagementAccess(userId, propertyId);
		return response(primaryAccount(propertyId));
	}

	/** 기본 상세는 복호화 없이 끝 네 자리만 반환해 전체 번호가 조회 캐시에 들어가지 않게 합니다. */
	public BankAccountSettings.Detail detail(UUID userId, UUID propertyId, UUID accountId) {
		var account = readableAccount(userId, propertyId, accountId);
		return new BankAccountSettings.Detail(propertyId, account.getId(), account.getUpdatedAt(),
		    account.getBankCode(), account.getBankName(), account.getAccountLast4(), account.getHolderNameSnapshot(),
		    account.getAlias(), account.isPrimary(), account.getStatus().name());
	}

	/** 공개 버튼 요청마다 권한·소속을 다시 확인한 선택 통장 한 건만 복호화합니다. */
	public BankAccountSettings.RevealedNumber revealNumber(UUID userId, UUID propertyId, UUID accountId) {
		var account = readableAccount(userId, propertyId, accountId);
		return new BankAccountSettings.RevealedNumber(propertyId, account.getId(), account.getUpdatedAt(),
		    security.decrypt(account.getAccountNumberEncrypted()));
	}

	/** 종료 통장의 과거 정보는 허용하되 다른 대상·삭제·비공용 계좌는 같은 권한 오류로 거부합니다. */
	private BankAccount readableAccount(UUID userId, UUID propertyId, UUID accountId) {
		requireManagementAccess(userId, propertyId);
		return accounts
		    .findById(accountId).filter(account -> propertyId.equals(account.getPropertyId())
		        && account.getDeletedAt() == null && account.getBuildingId() == null)
		    .orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
	}

	/** 업로드·수납과 같은 관리대상 잠금 아래 계좌 정보만 정정하고 과거 거래·잔고는 다시 쓰지 않습니다. */
	@Transactional
	public BankAccountSettings.Response correct(UUID userId, UUID propertyId, BankAccountSettings.Request request) {
		requireManagementAccess(userId, propertyId);
		properties.findForUnitUpdate(propertyId).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		var account = primaryAccount(propertyId);
		if (!account.getId().equals(request.accountId()))
			throw new PaymentException("BANK_ACCOUNT_CONFLICT");
		var protectedNumber = security.protect(request.accountNumber());
		// 응답 유실 후 같은 값의 재시도는 다시 정정하지 않고 현재 저장 결과를 반환합니다.
		boolean same = account.getBankCode().equals(request.bankCode())
		    && account.getBankName().equals(request.bankName())
		    && account.getHolderNameSnapshot().equals(request.holderName())
		    && account.getAccountNumberHmac().equals(protectedNumber.hmac());
		if (same)
			return response(account);
		if (!account.getUpdatedAt().isEqual(request.updatedAt()))
			throw new PaymentException("BANK_ACCOUNT_CONFLICT");
		boolean duplicate = accounts.findByPropertyIdAndDeletedAtIsNull(propertyId).stream()
		    .anyMatch(other -> !other.getId().equals(account.getId()) && other.getBankCode().equals(request.bankCode())
		        && other.getAccountNumberHmac().equals(protectedNumber.hmac()));
		if (duplicate)
			throw new PaymentException("BANK_ACCOUNT_DUPLICATE");
		account.correctDetails(request.bankCode(), request.bankName(), request.holderName(), protectedNumber);
		accounts.flush();
		return response(account);
	}

	/** 변경 권한과 계좌 원문 조회 권한은 기존 통장 관리의 관리자 범위로 제한합니다. */
	private void requireManagementAccess(UUID userId, UUID propertyId) {
		access.getManagementContext(userId, propertyId);
	}

	/** 여러 기본 계좌나 동별 계좌를 임의로 선택해 정정하지 않도록 대상을 한 건으로 제한합니다. */
	private BankAccount primaryAccount(UUID propertyId) {
		List<BankAccount> current = accounts.findByPropertyIdAndDeletedAtIsNull(propertyId).stream()
		    .filter(account -> account.isPrimary() && account.getBuildingId() == null
		        && account.getStatus() == BankAccountStatus.ACTIVE)
		    .toList();
		if (current.size() != 1)
			throw new PaymentException("PAYMENT_ACCOUNT_UNAVAILABLE");
		return current.getFirst();
	}

	/** 종료 통장도 과거 내역 확인을 위해 목록에 유지하며 번호 원문은 이 권한 조회에서만 제공합니다. */
	public List<BankAccountSettings.Response> list(UUID userId, UUID propertyId) {
		requireManagementAccess(userId, propertyId);
		return accounts.findByPropertyIdAndDeletedAtIsNull(propertyId).stream().map(this::response).toList();
	}

	/** 계좌 추가·정정과 기본 전환을 같은 잠금으로 직렬화하고 기존 거래의 계좌 ID는 유지합니다. */
	@Transactional
	public BankAccountSettings.Response save(UUID userId, UUID propertyId, BankAccountSettings.Save request) {
		requireManagementAccess(userId, propertyId);
		var property = properties.findForUnitUpdate(propertyId)
		    .orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		requireManagementAccess(userId, propertyId);
		var primary = primaryAccount(propertyId);
		var number = security.protect(request.accountNumber());
		var existing = accounts.findById(request.accountId());
		var account = existing.orElse(null);
		if (account != null && (!propertyId.equals(account.getPropertyId()) || account.getDeletedAt() != null))
			throw new PaymentException("BANK_ACCOUNT_CONFLICT");
		boolean same = account != null && account.getStatus() == BankAccountStatus.ACTIVE
		    && account.getBankCode().equals(request.bankCode()) && account.getBankName().equals(request.bankName())
		    && account.getHolderNameSnapshot().equals(request.holderName())
		    && account.getAccountNumberHmac().equals(number.hmac())
		    && Objects.equals(account.getAlias(), request.alias())
		    && account.isPrimary() == request.isPrimary();
		// 응답을 잃은 동일 요청은 저장된 결과를 반환하되 이후 다른 전환을 다시 적용하지 않습니다.
		if (same)
			return response(account);
		if (!primary.getId().equals(request.primaryAccountId())
		    || (account != null && !account.getUpdatedAt().equals(request.updatedAt()))
		    || (account == null && request.updatedAt() != null))
			throw new PaymentException("BANK_ACCOUNT_CONFLICT");
		if (account != null && account.getStatus() != BankAccountStatus.ACTIVE)
			throw new PaymentException("BANK_ACCOUNT_CLOSED");
		if (account != null && account.isPrimary() && !request.isPrimary())
			throw new PaymentException("BANK_ACCOUNT_PRIMARY_REQUIRED");
		var selectedId = request.accountId();
		if (accounts.findByPropertyIdAndDeletedAtIsNull(propertyId).stream()
		    .anyMatch(other -> !other.getId().equals(selectedId) && other.getBankCode().equals(request.bankCode())
		        && other.getAccountNumberHmac().equals(number.hmac())))
			throw new PaymentException("BANK_ACCOUNT_DUPLICATE");
		if (account == null) {
			account = BankAccount.register(request.accountId(), property, request.bankCode(), request.bankName(),
			    request.holderName(), number, request.alias(), accounts.nextRegistrationOrder(propertyId),
			    OffsetDateTime.now(clock));
			// 할당 ID를 사용하는 신규 계좌는 merge 결과를 계속 사용해야 같은 요청의 기본 지정도 저장됩니다.
			account = accounts.save(account);
		} else {
			account.correctDetails(request.bankCode(), request.bankName(), request.holderName(), number);
			account.rename(request.alias());
		}
		if (request.isPrimary() && !account.isPrimary()) {
			primary.designatePrimary(false);
			accounts.flush();
			account.designatePrimary(true);
		}
		accounts.flush();
		return response(account);
	}

	/** 기본 계좌 종료는 금지하고 통장 사용 종료만 기록해 수납·잔고·과거 거래를 보존합니다. */
	@Transactional
	public BankAccountSettings.Response close(UUID userId, UUID propertyId, UUID id,
	    BankAccountSettings.Close request) {
		requireManagementAccess(userId, propertyId);
		properties.findForUnitUpdate(propertyId).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		requireManagementAccess(userId, propertyId);
		var account = accounts.findById(id)
		    .filter(a -> propertyId.equals(a.getPropertyId()) && a.getDeletedAt() == null)
		    .orElseThrow(() -> new PaymentException("BANK_ACCOUNT_CONFLICT"));
		if (account.getStatus() == BankAccountStatus.CLOSED)
			return response(account);
		if (!account.getUpdatedAt().equals(request.updatedAt()))
			throw new PaymentException("BANK_ACCOUNT_CONFLICT");
		if (account.isPrimary())
			throw new PaymentException("BANK_ACCOUNT_PRIMARY_REQUIRED");
		account.close(LocalDate.now(clock.withZone(ZoneId.of("Asia/Seoul"))));
		accounts.flush();
		return response(account);
	}

	private BankAccountSettings.Response response(BankAccount account) {
		return new BankAccountSettings.Response(account.getPropertyId(), account.getId(), account.getUpdatedAt(),
		    account.getBankCode(), account.getBankName(), security.decrypt(account.getAccountNumberEncrypted()),
		    account.getHolderNameSnapshot(), account.getAlias(), account.isPrimary(), account.getStatus().name());
	}
}
