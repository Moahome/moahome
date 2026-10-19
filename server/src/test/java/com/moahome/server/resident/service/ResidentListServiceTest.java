package com.moahome.server.resident.service;

import java.time.OffsetDateTime;
import java.util.*;
import com.moahome.server.auth.exception.*;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.domain.Property;
import com.moahome.server.property.dto.ManagementPropertyResponse;
import com.moahome.server.property.repo.*;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.resident.repo.ResidentRepository;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ResidentListServiceTest {
	private final ManagementAccessService access = mock(ManagementAccessService.class);

	private final PropertyRepository properties = mock(PropertyRepository.class);

	private final BuildingRepository buildings = mock(BuildingRepository.class);

	private final ResidentRepository residents = mock(ResidentRepository.class);

	private final ResidentListService service = new ResidentListService(access, properties, buildings, residents);

	private final UUID userId = UUID.randomUUID();

	private final UUID propertyId = UUID.randomUUID();

	@Test
	void rejectsMissingAccessAndManagerBeforeReadingAnyDirectoryData() {
		doThrow(new AuthException(AuthErrorCode.ACCESS_DENIED)).when(access).getManagementContext(userId, propertyId);
		assertThatThrownBy(() -> service.list(userId, propertyId)).isInstanceOf(AuthException.class);
		doReturn(new ManagementPropertyResponse(propertyId, "대상", PropertyMemberRole.MANAGER)).when(access)
		    .getManagementContext(userId, propertyId);
		assertThatThrownBy(() -> service.list(userId, propertyId)).isInstanceOfSatisfying(AuthException.class,
		    error -> assertThat(error.code()).isEqualTo(AuthErrorCode.ACCESS_DENIED));
		verifyNoInteractions(properties, buildings, residents);
	}

	@Test
	void readsOnlyRequestedPropertyAndKeepsEmptyDirectoryAsSuccess() {
		when(access.getManagementContext(userId, propertyId))
		    .thenReturn(new ManagementPropertyResponse(propertyId, "대상", PropertyMemberRole.ADMIN));
		when(properties.findById(propertyId))
		    .thenReturn(Optional.of(Property.create("대상", "주소", null, null, false, OffsetDateTime.now())));
		when(buildings.findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(propertyId)).thenReturn(List.of());
		when(residents.findDirectory(propertyId)).thenReturn(List.of());
		var response = service.list(userId, propertyId);
		assertThat(response.propertyId()).isEqualTo(propertyId);
		assertThat(response.hasBuildings()).isFalse();
		assertThat(response.residents()).isEmpty();
		verify(residents).findDirectory(propertyId);
	}
}
