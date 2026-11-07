package com.moahome.server.accounting.service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import com.moahome.server.payment.dto.PaymentResponse;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class HouseholdAccountingBalancesTest {
	/** 이후 월의 충당은 당시 선수금으로 남고 취소 수납·기타 입금·인계 선납을 수익으로 오인하지 않습니다. */
	@Test
	void derivesReceivablesAndAdvancesFromConfirmedHouseholdLedgerAtMonthEnd() {
		UUID a = UUID.randomUUID(), b = UUID.randomUUID(), c = UUID.randomUUID();
		UUID first = UUID.randomUUID(), second = UUID.randomUUID(), future = UUID.randomUUID();
		List<PaymentResponse.Charge> charges = List.of(
			new PaymentResponse.Charge(first, a, "2026-11", "100000", "ISSUED", LocalDate.of(2026,11,30)),
			new PaymentResponse.Charge(second, b, "2026-11", "100000", "ISSUED", LocalDate.of(2026,11,30)),
			new PaymentResponse.Charge(future, a, "2026-12", "100000", "ISSUED", LocalDate.of(2026,12,31)));
		var firstReceipt = payment(a, "150000", List.of(new PaymentResponse.Allocation(first,"100000"), new PaymentResponse.Allocation(future,"50000")));
		var secondReceipt = payment(b, "40000", List.of(new PaymentResponse.Allocation(second,"40000")));
		var canceled = payment(b, "999999", List.of());
		when(canceled.status()).thenReturn("CANCELED");
		var other = payment(b, "999999", List.of());
		when(other.receiptType()).thenReturn("OTHER");
		var openingReceipt = payment(c, "999999", List.of());
		when(openingReceipt.status()).thenReturn("OPENING");
		var ledger = new PaymentResponse.Ledger(UUID.randomUUID(), LocalDate.of(2026,12,15), List.of(),
			List.of(unit(a,"101호"),unit(b,"102호"),unit(c,"103호")), charges,
			List.of(firstReceipt,secondReceipt,canceled,other,openingReceipt), List.of(), List.of(
				new PaymentResponse.OpeningCredit(UUID.randomUUID(),b,LocalDate.of(2026,10,31),"10000",List.of(new PaymentResponse.Allocation(second,"10000"))),
				new PaymentResponse.OpeningCredit(UUID.randomUUID(),c,LocalDate.of(2026,10,31),"30000",List.of())), List.of());
		UUID receivable = UUID.randomUUID(), advance = UUID.randomUUID();
		var result = HouseholdAccountingBalances.calculate(ledger, YearMonth.of(2026,11), receivable, advance);
		assertThat(result).hasSize(3).allSatisfy(row -> {
			assertThat(row.receivableAccountId()).isEqualTo(receivable);
			assertThat(row.advanceAccountId()).isEqualTo(advance);
		});
		assertThat(result.stream().filter(row -> row.unitId().equals(a)).findFirst().orElseThrow()).satisfies(row -> {
			assertThat(row.receivable()).isEqualTo("0");
			assertThat(row.advance()).isEqualTo("50000");
		});
		assertThat(result.stream().filter(row -> row.unitId().equals(b)).findFirst().orElseThrow()).satisfies(row -> {
			assertThat(row.receivable()).isEqualTo("50000");
			assertThat(row.advance()).isEqualTo("0");
		});
		assertThat(result.stream().filter(row -> row.unitId().equals(c)).findFirst().orElseThrow().advance()).isEqualTo("30000");
	}

	private PaymentResponse.Unit unit(UUID id, String label) {
		return new PaymentResponse.Unit(id,label,"ACTIVE",true,null,null,List.of(),null);
	}

	private PaymentResponse.Payment payment(UUID unit, String amount, List<PaymentResponse.Allocation> allocations) {
		var result = mock(PaymentResponse.Payment.class);
		when(result.status()).thenReturn("CONFIRMED");
		when(result.receiptType()).thenReturn("HOUSEHOLD");
		when(result.date()).thenReturn(LocalDate.of(2026,11,15));
		when(result.unitId()).thenReturn(unit.toString());
		when(result.amount()).thenReturn(amount);
		when(result.allocations()).thenReturn(allocations);
		return result;
	}
}
