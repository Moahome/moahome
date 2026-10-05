package com.moahome.server.property.support;

import java.util.*;
import com.moahome.server.property.dto.*;
import com.moahome.server.property.dto.PropertyRegistrationRequest.*;

public final class RegistrationFixtures {
	private RegistrationFixtures() {
	}

	public static PropertyRegistrationRequest request(UUID id, boolean hasBuildings) {
		return new PropertyRegistrationRequest(id, new BasicInfoRequest(" 모아빌라 ", " 예시 주소 ", " ", "빌라", hasBuildings),
			hasBuildings ? List.of(new BuildingInput("a", "101동"), new BuildingInput("b", "102동")) : List.of(),
			List.of(new UnitInput(hasBuildings ? "a" : null, "201", "201호", 2, "ACTIVE"),
				new UnitInput(hasBuildings ? "b" : null, "202", null, null, "VACANT")),
			List.of(new BankAccountInput("SAMPLE", "예시은행", "000-1234-5678", "예금주", true)),
			List.of(new FeeItemInput("일반관리비", 15000L), new FeeItemInput("청소용역비", 8000L),
				new FeeItemInput("엘리베이터비", 25300L), new FeeItemInput("기타", 1700L)));
	}

	public static PropertyRegistrationRequest withUnits(PropertyRegistrationRequest request, List<UnitInput> units) {
		return new PropertyRegistrationRequest(request.requestId(), request.basicInfo(), request.buildings(), units,
			request.bankAccounts(), request.feeItems());
	}
}
