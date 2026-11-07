package com.moahome.server.accounting.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.IntStream;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import com.moahome.server.accounting.domain.AccountingAccount;
import com.moahome.server.accounting.domain.IncomeGroup;
import com.moahome.server.accounting.dto.AccountingAccountSettings;
import com.moahome.server.accounting.dto.AccountingRequests;
import com.moahome.server.accounting.exception.AccountingException;
import com.moahome.server.accounting.repo.AccountingAccountRepository;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.expense.domain.Expense;
import com.moahome.server.expense.repo.ExpenseRepository;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.property.service.ManagementAccessService;

@Service
@Transactional
public class AccountingAccountSettingsService {
	private final ManagementAccessService access;
	private final PropertyRepository properties;
	private final AccountingAccountRepository accounts;
	private final ExpenseRepository expenses;
	private final PaymentTextSecurity security;
	private final Clock clock;

	public AccountingAccountSettingsService(ManagementAccessService access, PropertyRepository properties,
		AccountingAccountRepository accounts, ExpenseRepository expenses, PaymentTextSecurity security, Clock clock) {
		this.access = access;
		this.properties = properties;
		this.accounts = accounts;
		this.expenses = expenses;
		this.security = security;
		this.clock = clock;
	}

	/** 조회에서는 기본 과목을 가상으로 보충하고 삭제된 원천까지 사용 여부를 확인하며 DB를 쓰지 않습니다. */
	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	public AccountingAccountSettings.Workspace get(UUID actor, UUID property) {
		boolean canManage = access.getManagementContext(actor, property).role() == PropertyMemberRole.ADMIN;
		List<AccountingAccount> all = available(actor, property);
		Set<UUID> used = used(property, all);
		return new AccountingAccountSettings.Workspace(property, canManage, all.stream()
			.filter(value -> value.getDeletedAt() == null).sorted(Comparator.comparing(AccountingAccount::getCode))
			.map(value -> new AccountingAccountSettings.Account(value.getId(), value.getCode(), value.getName(),
				value.getReportGroup(), value.isDefaultAccount(), value.isActive(), used.contains(value.getId()), value.getRevision()))
			.toList());
	}

	/** 계정 변경 이력 조회도 같은 관리대상 권한을 확인하고 원천 금액과 독립된 표시 정보만 반환합니다. */
	@Transactional(readOnly = true)
	public List<AccountingAccountSettings.Change> history(UUID actor, UUID property, UUID account) {
		access.getManagementContext(actor, property);
		if (available(actor, property).stream().noneMatch(value -> value.getId().equals(account)))
			throw new AccountingException("ACCOUNTING_ACCOUNT_NOT_FOUND");
		return accounts.changes(property, account).stream().map(value -> new AccountingAccountSettings.Change(
			value.getRevision(), value.getName(), value.getCode(), IncomeGroup.valueOf(value.getReportGroup()),
			value.getActive(), value.getDeletedAt() == null ? null : value.getDeletedAt().atOffset(ZoneOffset.UTC),
			value.getChangedAt().atOffset(ZoneOffset.UTC))).toList();
	}

	/** 과목 설정은 부과 전에도 가능하며 기본 과목과 코드 범위·중복만 같은 잠금에서 확보합니다. */
	public UUID create(UUID actor, UUID property, AccountingRequests.CreateAccount request) {
		List<AccountingAccount> all = prepare(actor, property);
		if (request.group() == null)
			throw new AccountingException("INVALID_ACCOUNTING_ACCOUNT");
		String name = request.name().strip();
		AccountingAccount existing = all.stream().filter(value -> value.getName().equals(name)
			&& value.getReportGroup() == request.group()).findFirst().orElse(null);
		if (existing != null) {
			if (!existing.isSelectable() || (request.code() != null && !existing.getCode().equals(request.code())))
				throw new AccountingException("ACCOUNTING_CODE_CONFLICT");
			return existing.getId();
		}
		String code = request.code() == null ? nextCode(request.group(), all) : request.code();
		validateUnique(all, null, name, code, request.group());
		return accounts.saveAndFlush(AccountingAccount.create(property, code, name, request.group(), null,
			actor, OffsetDateTime.now(clock))).getId();
	}

	/** 이름 변경 전에 자동 연결을 고정하고 사용한 코드·분류가 과거 거래의 성격을 바꾸지 않게 합니다. */
	public void edit(UUID actor, UUID property, UUID account, AccountingRequests.EditAccount request) {
		List<AccountingAccount> all = prepare(actor, property);
		AccountingAccount target = target(all, account, request.expectedRevision());
		validateUnique(all, account, request.name().strip(), request.code(), request.group());
		target.edit(request.name(), request.code(), request.group(), used(property, all).contains(account), actor, OffsetDateTime.now(clock));
		accounts.flush();
	}

	/** 중지·재개는 신규 선택만 변경하고 기존 지출·원장에 연결한 과목 ID를 보존합니다. */
	public void status(UUID actor, UUID property, UUID account, AccountingRequests.AccountStatus request) {
		AccountingAccount target = target(prepare(actor, property), account, request.expectedRevision());
		target.changeActive(request.active(), actor, OffsetDateTime.now(clock));
		accounts.flush();
	}

	/** 미사용 추가 과목만 논리 삭제하며 기본 과목과 과거 사용 여부를 저장 직전에 다시 검사합니다. */
	public void delete(UUID actor, UUID property, UUID account, AccountingRequests.DeleteAccount request) {
		List<AccountingAccount> all = prepare(actor, property);
		AccountingAccount target = target(all, account, request.expectedRevision());
		target.remove(used(property, all).contains(account), actor, OffsetDateTime.now(clock));
		accounts.flush();
	}

	/** 관리대상 잠금과 역할 재확인 후 기본 과목·기존 자동 분류를 같은 트랜잭션으로 저장합니다. */
	private List<AccountingAccount> prepare(UUID actor, UUID property) {
		requireAdmin(actor, property);
		properties.findForUnitUpdate(property).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
		requireAdmin(actor, property);
		List<AccountingAccount> existing = accounts.findByPropertyIdOrderByCreatedAtAscIdAsc(property);
		List<AccountingAccount> all = available(actor, property);
		accounts.saveAllAndFlush(all.stream().filter(value -> existing.stream()
			.noneMatch(previous -> previous.getId().equals(value.getId()))).toList());
		all = accounts.findByPropertyIdOrderByCreatedAtAscIdAsc(property);
		Set<UUID> linked = new HashSet<>(accounts.automaticLinks(property).stream()
			.map(AccountingAccountRepository.AutomaticLink::getExpenseId).toList());
		for (Expense expense : expenses.findAllByPropertyId(property)) {
			if (expense.getAccountingAccountId() != null || linked.contains(expense.getId()))
				continue;
			AccountingAccount match = ExpenseAccountService.match(security.decrypt(expense.getCategoryEncrypted()), all);
			accounts.rememberAutomatic(expense.getId(), property, match == null ? null : match.getId(), actor, OffsetDateTime.now(clock));
		}
		return all;
	}

	private void requireAdmin(UUID actor, UUID property) {
		if (access.getManagementContext(actor, property).role() != PropertyMemberRole.ADMIN)
			throw new AuthException(AuthErrorCode.ACCESS_DENIED);
	}

	private List<AccountingAccount> available(UUID actor, UUID property) {
		return AccountingAccount.withDefaults(property, accounts.findByPropertyIdOrderByCreatedAtAscIdAsc(property),
			actor, OffsetDateTime.now(clock));
	}

	/** 이미 고정한 미분류도 다시 추측하지 않으며 삭제된 지출의 자동 대응도 사용으로 취급합니다. */
	private Set<UUID> used(UUID property, List<AccountingAccount> all) {
		Set<UUID> used = new HashSet<>(accounts.usedIds(property));
		Set<UUID> linked = new HashSet<>(accounts.automaticLinks(property).stream()
			.map(AccountingAccountRepository.AutomaticLink::getExpenseId).toList());
		for (Expense expense : expenses.findAllByPropertyId(property)) {
			if (expense.getAccountingAccountId() != null || linked.contains(expense.getId()))
				continue;
			AccountingAccount match = ExpenseAccountService.match(security.decrypt(expense.getCategoryEncrypted()), all);
			if (match != null)
				used.add(match.getId());
		}
		return used;
	}

	private AccountingAccount target(List<AccountingAccount> all, UUID id, int expectedRevision) {
		AccountingAccount target = all.stream().filter(value -> value.getId().equals(id) && value.getDeletedAt() == null)
			.findFirst().orElseThrow(() -> new AccountingException("ACCOUNTING_ACCOUNT_NOT_FOUND"));
		if (target.getRevision() != expectedRevision)
			throw new AccountingException("ACCOUNTING_ACCOUNT_CONFLICT");
		return target;
	}

	private void validateUnique(List<AccountingAccount> all, UUID id, String name, String code, IncomeGroup group) {
		if (group == null || !group.acceptsCode(code))
			throw new AccountingException("INVALID_ACCOUNTING_ACCOUNT");
		if (all.stream().filter(value -> !value.getId().equals(id)).anyMatch(value -> value.getCode().equals(code)
			|| (value.getReportGroup() == group && value.getName().equals(name))))
			throw new AccountingException("ACCOUNTING_CODE_CONFLICT");
	}

	/** 기본 코드와 삭제된 과목 코드는 피하고 해당 유형의 빈 세 자리 코드만 배정합니다. */
	private String nextCode(IncomeGroup group, List<AccountingAccount> all) {
		int start = switch (group) {
			case ASSET -> 104;
			case LIABILITY -> 203;
			case OPERATING_REVENUE -> 402;
			case OTHER_REVENUE -> 902;
			case OPERATING_EXPENSE, OTHER_EXPENSE -> 814;
		};
		int end = start / 100 * 100 + 99;
		return IntStream.rangeClosed(start, end).mapToObj(String::valueOf)
			.filter(code -> all.stream().noneMatch(value -> value.getCode().equals(code))).findFirst()
			.orElseThrow(() -> new AccountingException("ACCOUNTING_CODE_EXHAUSTED"));
	}
}
