package com.moahome.server.property.service;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.moahome.server.property.dto.PropertyRegistrationRequest.BuildingInput;
import com.moahome.server.property.dto.RegistrationResidentPreview;
import com.moahome.server.resident.service.ResidentExcelReader;
import com.moahome.server.user.service.UserService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class RegistrationResidentPreviewServiceTest {
	/** 동 유무와 관계없이 관리소장 중복은 제외하고 동의한 정상 번호만 초기 초안으로 돌려줍니다. */
	@ParameterizedTest
	@ValueSource(booleans = { false, true })
	void validatesDraftUnitsExcludesAdministratorAndDoesNotReturnUnconsentedPhones(boolean hasBuildings) {
		UserService users = mock(UserService.class);
		ResidentExcelReader reader = mock(ResidentExcelReader.class);
		UUID actor = UUID.randomUUID();
		String building = hasBuildings ? "101동" : "";
		var units = List.of(new RegistrationResidentPreview.UnitReference(hasBuildings ? "a" : null, "101"),
		    new RegistrationResidentPreview.UnitReference(hasBuildings ? "a" : null, "102"));
		var setup = new RegistrationResidentPreview.Setup(hasBuildings,
		    hasBuildings ? List.of(new BuildingInput("a", "101동")) : List.of(), units,
		    new RegistrationResidentPreview.Administrator("관리소장", 0));
		when(reader.read(null)).thenReturn(List.of(
		    new ResidentExcelReader.InputRow(2, building, "101", "관리소장", "기타", "invalid", false, "O"),
		    new ResidentExcelReader.InputRow(3, building, "102", "동의 주민", "임차인", "01012345678", false, "O"),
		    new ResidentExcelReader.InputRow(4, building, "102", "번호 제외", "", "01098765432", false, "X"),
		    new ResidentExcelReader.InputRow(5, building, "999", "없는 세대", "", "", false, "")));
		var rows = new RegistrationResidentPreviewService(users, reader).preview(actor, setup, null);
		assertThat(rows).extracting(RegistrationResidentPreview.Row::status)
		    .containsExactly("DUPLICATE", "READY", "READY", "ERROR");
		assertThat(rows.get(0).reason()).contains("관리소장");
		assertThat(rows.get(0).phone()).isNull();
		assertThat(rows.get(1).phone()).isEqualTo("+821012345678");
		assertThat(rows.get(2).phone()).isNull();
		assertThat(rows.get(2).relationType()).isEqualTo("OTHER");
		verify(users).requirePropertyCreation(actor);
	}
}
