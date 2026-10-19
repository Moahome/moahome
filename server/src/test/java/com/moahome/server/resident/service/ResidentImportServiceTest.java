package com.moahome.server.resident.service;

import java.time.*;
import java.util.*;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.dto.ManagementPropertyResponse;
import com.moahome.server.property.repo.*;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.resident.domain.ResidentImportBatch;
import com.moahome.server.resident.dto.*;
import com.moahome.server.resident.repo.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ResidentImportServiceTest {
	@Test
	void blankRelationsBecomeOtherThroughPreviewAndSaveWhileUnknownValuesRemainErrors() {
		var actor = UUID.randomUUID();
		var propertyId = UUID.randomUUID();
		var unitId = UUID.randomUUID();
		var access = mock(ManagementAccessService.class);
		var properties = mock(PropertyRepository.class);
		var buildings = mock(BuildingRepository.class);
		var units = mock(UnitRepository.class);
		var residents = mock(ResidentRepository.class);
		var batches = mock(ResidentImportBatchRepository.class);
		var registrations = mock(ResidentRegistrationService.class);
		var reader = mock(ResidentExcelReader.class);
		var property = mock(Property.class);
		var unit = mock(Unit.class);
		when(access.getManagementContext(actor, propertyId))
		    .thenReturn(new ManagementPropertyResponse(propertyId, "대상", PropertyMemberRole.ADMIN));
		when(properties.findById(propertyId)).thenReturn(Optional.of(property));
		when(property.getId()).thenReturn(propertyId);
		when(units.findByPropertyIdAndDeletedAtIsNull(propertyId)).thenReturn(List.of(unit));
		when(unit.getId()).thenReturn(unitId);
		when(unit.getUnitNumber()).thenReturn("301");
		when(unit.getStatus()).thenReturn(UnitStatus.ACTIVE);
		when(reader.read(null))
		    .thenReturn(List.of(new ResidentExcelReader.InputRow(2, "", "301", "구분 미입력", "", "", false),
		        new ResidentExcelReader.InputRow(3, "", "301", "구분 공백", "  ", "", false),
		        new ResidentExcelReader.InputRow(4, "", "301", "오입력", "관리자", "", false)));
		when(batches.saveAndFlush(any())).thenAnswer(input -> input.getArgument(0));
		var service = new ResidentImportService(access, properties, buildings, units, residents, batches, registrations,
		    reader, mock(), new ObjectMapper(), Clock.systemUTC());
		var preview = service.preview(actor, propertyId, null);
		assertThat(preview.rows()).extracting(ResidentImportResponse.Row::status).containsExactly("READY", "READY",
		    "ERROR");
		assertThat(preview.rows().subList(0, 2)).extracting(ResidentImportResponse.Row::relationType)
		    .containsOnly("OTHER");
		var capture = org.mockito.ArgumentCaptor.forClass(ResidentImportBatch.class);
		verify(batches).saveAndFlush(capture.capture());
		when(batches.findByIdAndPropertyIdAndCreatedBy(preview.importId(), propertyId, actor))
		    .thenReturn(Optional.of(capture.getValue()));
		when(registrations.register(eq(actor), eq(propertyId), any())).thenAnswer(input -> {
			ResidentRegistrationRequest request = input.getArgument(2);
			return new ResidentRegistrationResponse(request.requestId(), propertyId, unitId, false);
		});
		var result = service.commit(actor, propertyId, preview.importId(),
		    new ResidentImportCommitRequest(List.of(2, 3)));
		assertThat(result.rows()).extracting(ResidentImportResponse.Row::status).containsExactly("SUCCESS", "SUCCESS",
		    "ERROR");
		verify(registrations, times(2)).register(eq(actor), eq(propertyId),
		    argThat(input -> input.relationType().equals("OTHER")));
	}
}
