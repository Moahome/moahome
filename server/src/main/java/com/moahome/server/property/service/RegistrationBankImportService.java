package com.moahome.server.property.service;

import java.io.*;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.time.*;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import com.moahome.server.banking.domain.*;
import com.moahome.server.banking.dto.*;
import com.moahome.server.banking.repo.BankTransactionRepository;
import com.moahome.server.banking.service.*;
import com.moahome.server.billing.domain.*;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.expense.service.ExpenseService;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.payment.service.PaymentService;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.dto.*;
import com.moahome.server.property.exception.RegistrationException;
import com.moahome.server.user.service.UserService;

/** 등록 전에는 원본을 검증만 하고 최종 등록 트랜잭션에서 실제 입금·출금을 함께 저장합니다. */
@Service
public class RegistrationBankImportService {
	private final BankTransactionReader reader;
	private final UserService users;
	private final PaymentTextSecurity security;
	private final BankTransactionRepository transactions;
	private final PaymentService payments;
	private final BankingService banking;
	private final ExpenseService expenses;
	private final IncomeAllocationService incomes;
	private final Clock clock;

	public RegistrationBankImportService(BankTransactionReader reader, UserService users,
	    @Lazy PaymentTextSecurity security, BankTransactionRepository transactions, PaymentService payments,
	    BankingService banking, ExpenseService expenses, IncomeAllocationService incomes,
	    Clock clock) {
		this.reader = reader;
		this.users = users;
		this.security = security;
		this.transactions = transactions;
		this.payments = payments;
		this.banking = banking;
		this.expenses = expenses;
		this.incomes = incomes;
		this.clock = clock;
	}

	public record Row(UUID id, LocalDate date, LocalTime time, String payer, String memo, String amount,
	    String balance, String direction, boolean autoMatchEligible) {
	}

	public record Preview(List<Row> rows, BankingResponse.Period period, BankingResponse.ImportSupport support,
	    int duplicateCount) {
	}

	public BankingResponse.ImportSupport support(UUID actor, String bankCode) {
		users.requirePropertyCreation(actor);
		return BankImportFormat.support(bankCode);
	}

	/** 존재하지 않는 관리대상의 원장을 만들지 않고 선택 은행의 파서와 거래 식별 규칙을 그대로 사용합니다. */
	@Transactional(readOnly = true)
	public Preview preview(UUID actor, String bankCode, MultipartFile file) {
		users.requirePropertyCreation(actor);
		List<BankTransactionReader.Row> source = reader.readAll(file, bankCode);
		List<Row> rows = new ArrayList<>();
		Set<String> seen = new HashSet<>();
		for (var row : source) {
			if (row.date().isAfter(today()))
				throw new PaymentException("INVALID_PAYMENT_DATE");
			String key = BankTransactionKeys.key(row, security);
			if (seen.add(key))
				rows.add(new Row(BankTransactionKeys.previewId(key), row.date(), row.time(), row.payer(), row.memo(),
				    row.amount().toPlainString(), row.balance() == null ? null : row.balance().toPlainString(),
				    row.direction(), row.autoMatchEligible()));
		}
		return new Preview(rows, new BankingResponse.Period(source.stream().map(r -> r.date()).min(LocalDate::compareTo)
		    .orElseThrow(), source.stream().map(r -> r.date()).max(LocalDate::compareTo).orElseThrow()),
		    BankImportFormat.support(bankCode), source.size() - rows.size());
	}

	/** 파일·선택·임시 참조·잔액 인계의 관계를 생성 전에 검증하며 Client가 보낸 금액 행은 신뢰하지 않습니다. */
	public void validate(PropertyRegistrationRequest request) {
		var opening = request.openingBalances();
		if (opening == null) return;
		try {
			Set<UUID> manualIds = new HashSet<>();
			for (var row : opening.manualTransactions() == null ? List.<RegistrationManualTransaction>of() : opening.manualTransactions()) {
				if (!manualIds.add(row.id()) || row.accountIndex() >= request.bankAccounts().size() || row.date().isAfter(today())
				    || new BigDecimal(row.amount()).signum() <= 0 || (row.unitIndex() != null && row.unitIndex() >= request.units().size()))
					throw new PaymentException("INVALID_BANK_SELECTION");
				if ("EXPENSE".equals(row.direction())) {
					if (row.allocation() == null || row.unitIndex() != null) throw new PaymentException("INVALID_BANK_SELECTION");
				} else if (("HOUSEHOLD".equals(row.purpose()) != (row.unitIndex() != null))
				    || (!"HOUSEHOLD".equals(row.purpose()) && (row.category() == null || row.category().isBlank()))
				    || ("SHARED".equals(row.purpose()) != (row.allocation() != null))) {
					throw new PaymentException("INVALID_BANK_SELECTION");
				}
				validateShares(row.allocation(), request);
			}
			long total = 0;
			Set<String> seen = new HashSet<>();
			for (var file : opening.bankImports() == null ? List.<RegistrationBankImport>of() : opening.bankImports()) {
				if (file.accountIndex() >= request.bankAccounts().size())
					throw new PaymentException("INVALID_BANK_SELECTION");
				total += file.content().length();
				if (total > 28_000_000)
					throw new PaymentException("INVALID_BANK_FILE");
				var available = source(file, request.bankAccounts().get(file.accountIndex()).bankCode());
				for (var choice : file.rows()) {
					var row = available.get(choice.id());
					if (row == null || !seen.add(file.accountIndex() + ":" + choice.id())
					    || (choice.unitIndex() != null && choice.unitIndex() >= request.units().size()))
						throw new PaymentException("INVALID_BANK_SELECTION");
					if (choice.transfer()) {
						if (choice.unitIndex() != null || choice.incomeCategory() != null || choice.incomeNote() != null
						    || choice.expense() != null || choice.incomeAllocation() != null)
							throw new PaymentException("INVALID_BANK_SELECTION");
						continue;
					}
					if ("INCOME".equals(row.direction())) {
						if (choice.expense() != null || (choice.unitIndex() != null && choice.incomeCategory() != null)
						    || (choice.incomeAllocation() != null && (choice.unitIndex() != null || choice.incomeCategory() == null))
						    || (!row.date().isAfter(opening.cutoffDate()) && choice.unitIndex() == null && choice.incomeCategory() == null))
							throw new PaymentException("INVALID_BANK_SELECTION");
					} else if (choice.expense() == null || choice.unitIndex() != null || choice.incomeCategory() != null
					    || choice.incomeNote() != null || choice.incomeAllocation() != null) {
						throw new PaymentException("INVALID_BANK_SELECTION");
					}
					validateShares(choice.expense(), request);
					validateShares(choice.incomeAllocation(), request);
				}
			}
		} catch (PaymentException | IllegalArgumentException failure) {
			throw invalid();
		}
	}

	private void validateShares(RegistrationBankImport.Distribution distribution, PropertyRegistrationRequest request) {
		if (distribution == null) return;
		Set<String> buildingIds = request.buildings().stream().map(b -> b.clientId()).collect(Collectors.toSet());
		if (distribution.allocations().stream().anyMatch(a -> a.buildingClientId() != null && !buildingIds.contains(a.buildingClientId())))
			throw new PaymentException("INVALID_EXPENSE_TARGET");
	}

	/** 입출금 모두 같은 등록 트랜잭션에 참여합니다. 기준일까지 입금은 새 미수에 충당하지 않습니다. */
	@Transactional(propagation = Propagation.MANDATORY)
	public void initialize(UUID actor, Property property, PropertyRegistrationRequest request,
	    Map<String, Building> buildings, List<Unit> units, List<BankAccount> accounts) {
		var input = request.openingBalances();
		try {
			for (var row : input.manualTransactions() == null ? List.<RegistrationManualTransaction>of() : input.manualTransactions()) {
				UUID account = accounts.get(row.accountIndex()).getId();
				var allocation = distribution(row.allocation(), buildings);
				if ("INCOME".equals(row.direction())) {
					var receipt = payments.recordRegistrationManualReceipt(actor, property.getId(), account, row.id(), row.date(),
					    row.amount(), row.payer(), row.purpose(), new PaymentService.BankReceiptChoice(
					        row.unitIndex() == null ? null : units.get(row.unitIndex()).getId(), row.category(), row.note()));
					if (allocation != null) incomes.allocate(receipt, allocation, actor);
				} else {
					banking.manualExpense(actor, property.getId(), new BankingRequests.ManualExpense(row.id(), account, row.date(),
					    row.amount(), allocation.category(), allocation.note(), allocation.mode(), allocation.allocations()));
				}
			}
			for (var file : input.bankImports() == null ? List.<RegistrationBankImport>of() : input.bankImports()) {
				var account = accounts.get(file.accountIndex());
				var available = source(file, account.getBankCode());
				List<BankingRequests.Selection> subsequent = new ArrayList<>();
				for (var choice : file.rows()) {
					var row = available.get(choice.id());
					UUID unitId = choice.unitIndex() == null ? null : units.get(choice.unitIndex()).getId();
					var expense = distribution(choice.expense(), buildings);
					var allocation = distribution(choice.incomeAllocation(), buildings);
					if (row.date().isAfter(input.cutoffDate())) {
						subsequent.add(new BankingRequests.Selection(choice.id(), unitId, choice.incomeCategory(),
						    choice.incomeNote(), expense, allocation, choice.transfer()));
						continue;
					}
					if ("INCOME".equals(row.direction()) && !choice.transfer()) {
						var receipt = payments.recordOpeningBankReceipt(actor, property.getId(), account.getId(), row,
						    new PaymentService.BankReceiptChoice(unitId, choice.incomeCategory(), choice.incomeNote()));
						if (allocation != null) incomes.allocate(receipt, allocation, actor);
						continue;
					}
					var original = BankTransaction.create(property.getId(), account.getId(), row.date(), row.amount(),
					    security.protect(row.payer()).encrypted(), security.nameHash(row.payer()),
					    row.memo() == null ? null : security.protect(row.memo()).encrypted(), row.reference(),
					    BankTransactionKeys.key(row, security), actor, OffsetDateTime.now(clock), row.time(), row.balance());
					if ("EXPENSE".equals(row.direction())) original.markExpense();
					if (choice.transfer()) original.markTransferCandidate();
					transactions.saveAndFlush(original);
					if (expense != null) expenses.confirm(original, expense, actor);
				}
				if (!subsequent.isEmpty())
					banking.upload(actor, property.getId(), decode(file), new BankingRequests.Import(subsequent, account.getId()));
			}
		} catch (PaymentException | IllegalArgumentException failure) {
			throw invalid();
		}
	}

	private BankingRequests.Expense distribution(RegistrationBankImport.Distribution input, Map<String, Building> buildings) {
		if (input == null) return null;
		return new BankingRequests.Expense(input.category(), input.note(), input.mode(), input.saveAsRule(),
		    input.allocations().stream().map(a -> new BankingRequests.Allocation(a.buildingClientId() == null ? null
		        : buildings.get(a.buildingClientId()).getId(), a.label(), a.amount(), a.percentage())).toList());
	}

	private Map<UUID, BankTransactionReader.Row> source(RegistrationBankImport input, String bankCode) {
		Map<UUID, BankTransactionReader.Row> rows = new LinkedHashMap<>();
		for (var row : reader.readAll(decode(input), bankCode)) {
			if (row.date().isAfter(today())) throw new PaymentException("INVALID_PAYMENT_DATE");
			rows.putIfAbsent(BankTransactionKeys.previewId(BankTransactionKeys.key(row, security)), row);
		}
		return rows;
	}

	private MultipartFile decode(RegistrationBankImport input) {
		return new SourceFile(input.fileName(), Base64.getDecoder().decode(input.content()));
	}

	private LocalDate today() {
		return LocalDate.now(clock.withZone(BillingCalendar.ZONE));
	}

	private RegistrationException invalid() {
		return RegistrationException.invalid("openingBalances.bankImports", "INVALID_COMBINATION",
		    "업로드한 원본 파일과 입금·출금의 날짜·금액·세대·배분 설정을 확인해주세요.");
	}

	private record SourceFile(String fileName, byte[] bytes) implements MultipartFile {
		public String getName() { return "file"; }
		public String getOriginalFilename() { return fileName; }
		public String getContentType() { return "application/octet-stream"; }
		public boolean isEmpty() { return bytes.length == 0; }
		public long getSize() { return bytes.length; }
		public byte[] getBytes() { return bytes.clone(); }
		public InputStream getInputStream() { return new ByteArrayInputStream(bytes); }
		public void transferTo(File destination) throws IOException { Files.write(destination.toPath(), bytes); }
		public String toString() { return "RegistrationBankFile[REDACTED]"; }
	}
}
