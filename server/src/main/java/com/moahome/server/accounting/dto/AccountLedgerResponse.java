package com.moahome.server.accounting.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import io.swagger.v3.oas.annotations.media.Schema;

/** 기존 통장·청구·유효 충당·손익 원천의 과목별 반영 내역이며 정식 전표·기초 잔액 조회와 구분합니다. */
public record AccountLedgerResponse(UUID propertyId, String propertyName, OffsetDateTime generatedAt,
	IncomeStatementResponse.Range range, IncomeStatementResponse.Configuration configuration,
	String completeness, boolean supported, boolean canManage, UUID accountId, List<UUID> accountIds, UUID buildingId, UUID bankAccountId,
	List<IncomeStatementResponse.Building> buildings, List<IncomeStatementResponse.Account> accounts,
	List<BankBalance> bankBalances, List<Row> rows, List<IncomeStatementResponse.Issue> issues, String revenue, String expense) {
	@Schema(name = "AccountLedgerRow")
	public record Row(IncomeStatementResponse.Entry entry, String cumulativeAmount, List<String> sourceIds, CashBalance cashBalance) {
		public Row(IncomeStatementResponse.Entry entry, String cumulativeAmount, List<String> sourceIds) {
			this(entry, cumulativeAmount, sourceIds, null);
		}
	}
	@Schema(name = "AccountLedgerBankBalance")
	public record BankBalance(UUID accountId, String name, String openingBalance, String income, String expense,
		String closingBalance) { }
	@Schema(name = "AccountLedgerCashBalance")
	public record CashBalance(UUID bankAccountId, String bankAccountName, String ledgerBalance, String reportedBalance) { }
}
