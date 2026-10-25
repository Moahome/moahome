package com.moahome.server.payment.service;

import java.time.LocalDate;
import java.util.*;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.payment.domain.Payment;
import com.moahome.server.payment.dto.PaymentResponse;
import com.moahome.server.payment.repo.PaymentRepository;
import com.moahome.server.resident.dto.ResidentListResponse.ResidentItem;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PayerMatchServiceTest {
	private final UUID unitId = UUID.randomUUID();

	private final UUID otherUnitId = UUID.randomUUID();

	private PayerMatchService service;

	@BeforeEach
	void prepare() {
		PaymentTextSecurity security = mock(PaymentTextSecurity.class);
		when(security.nameHash(anyString())).thenAnswer(call -> call.<String>getArgument(0).replaceAll("(?U)\\s+", ""));
		service = new PayerMatchService(mock(PaymentRepository.class), security);
	}

	private PaymentResponse.Unit unit(UUID id, String building, String number, boolean eligible) {
		return new PaymentResponse.Unit(id, building + " " + number + "호", "ACTIVE", eligible, null, null,
		    List.of(), building);
	}

	private PayerMatchService.Match match(String payer, List<PaymentResponse.Unit> units) {
		return service.resolve(new PayerMatchService.Context(List.of(), Map.of()), payer,
		    LocalDate.of(2026, 10, 25), units, List.of());
	}

	@ParameterizedTest
	@ValueSource(strings = {"103-302", "103-302(9", "103-302(10", "103-302(9)", "103-302(12)", "103 - 302 (10)"})
	void recognizesUnitAndMonthlySuffixWithoutRegistration(String payer) {
		var result = match(payer, List.of(unit(unitId, "103동", "302", true)));
		assertThat(result.automatic()).isTrue();
		assertThat(result.unitId()).isEqualTo(unitId);
		assertThat(result.reason()).isEqualTo("동·호수 패턴 일치");
	}

	@ParameterizedTest
	@ValueSource(strings = {"103-302(0", "103-302(13", "103-302(수리비)", "이름103-302(9", "103-302(9)메모",
	        "103-302(", "103-302)", "103302", "103-999(9", "999-302(9"})
	void keepsUnknownFormatsAndMissingUnitsUnmatched(String payer) {
		assertThat(match(payer, List.of(unit(unitId, "103동", "302", true))).automatic()).isFalse();
	}

	@Test
	void refusesUnavailableOrAmbiguousUnitsAndDoesNotConcatenateDifferentBuildings() {
		assertThat(match("103-302(9", List.of(unit(unitId, "103동", "302", false))).automatic()).isFalse();
		assertThat(match("103-302(9", List.of(unit(unitId, "103동", "302", true),
		    unit(otherUnitId, "103동", "302", true))).automatic()).isFalse();
		assertThat(match("103-302(9", List.of(unit(otherUnitId, "1033", "02", true))).automatic()).isFalse();
		assertThat(match("103-302(9", List.of(unit(unitId, "103", "302", true))).unitId()).isEqualTo(unitId);
	}

	@Test
	void preservesResidentAndLatestHistoryPriority() {
		String payer = "103-302(9";
		List<PaymentResponse.Unit> units = List.of(unit(unitId, "103동", "302", true),
		    unit(otherUnitId, "104동", "401", true));
		ResidentItem resident = mock(ResidentItem.class);
		when(resident.name()).thenReturn(payer);
		when(resident.unitId()).thenReturn(otherUnitId);
		var named = service.resolve(new PayerMatchService.Context(List.of(), Map.of()), payer,
		    LocalDate.of(2026, 10, 25), units, List.of(resident));
		assertThat(named.unitId()).isEqualTo(otherUnitId);
		assertThat(named.reason()).isEqualTo("명단 이름 일치");
		Payment latest = mock(Payment.class);
		when(latest.getMatchedUnitId()).thenReturn(otherUnitId);
		var historical = service.resolve(new PayerMatchService.Context(List.of(), Map.of(payer, latest)), payer,
		    LocalDate.of(2026, 10, 25), units, List.of());
		assertThat(historical.unitId()).isEqualTo(otherUnitId);
		assertThat(historical.reason()).isEqualTo("최근 입금자명 일치");
	}
}
