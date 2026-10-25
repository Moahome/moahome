package com.moahome.server.resident.service;

import java.time.*;
import java.util.*;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.NoSuchBeanDefinitionException;
import org.springframework.beans.factory.ObjectProvider;

import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.common.security.PhoneSecurity;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.dto.ManagementPropertyResponse;
import com.moahome.server.property.repo.*;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.resident.dto.ResidentRegistrationRequest;
import com.moahome.server.resident.exception.ResidentRegistrationException;
import com.moahome.server.resident.repo.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ResidentRegistrationServiceTest {
	private final ManagementAccessService access = mock(ManagementAccessService.class);

	private final PropertyRepository properties = mock(PropertyRepository.class);

	private final UnitRepository units = mock(UnitRepository.class);

	private final BuildingRepository buildings = mock(BuildingRepository.class);

	private final ResidentRepository residents = mock(ResidentRepository.class);

	private final UnitResidentRepository affiliations = mock(UnitResidentRepository.class);

	private final ResidentRegistrationResultRepository results = mock(ResidentRegistrationResultRepository.class);

	@SuppressWarnings("unchecked")
	private final ObjectProvider<PhoneSecurity> security = mock(ObjectProvider.class);

	private final ResidentRegistrationService service = new ResidentRegistrationService(access, properties, units,
	    buildings, residents, affiliations, results, security, Clock.systemUTC());

	private final UUID actor = UUID.randomUUID();

	private final Property property = Property.create("테스트 대상", "주소", null, null, false, OffsetDateTime.now());

	private final Unit unit = Unit.create(property, null, "101", null, null, UnitStatus.ACTIVE, OffsetDateTime.now());

	private void authorize() {
		when(access.getManagementContext(actor, property.getId()))
		    .thenReturn(new ManagementPropertyResponse(property.getId(), "대상", PropertyMemberRole.ADMIN));
		when(properties.findForUnitUpdate(property.getId())).thenReturn(Optional.of(property));
		when(units.findByIdAndPropertyIdAndDeletedAtIsNull(unit.getId(), property.getId()))
		    .thenReturn(Optional.of(unit));
	}

	@Test
	void optionalContactDoesNotRequireEncryptionKeysButContactFailurePreventsWrites() {
		authorize();
		var request = new ResidentRegistrationRequest(UUID.randomUUID(), "주민", "01012345678", unit.getId(), "OWNER");
		when(security.getObject()).thenThrow(new NoSuchBeanDefinitionException("phone security unavailable"));
		assertThatThrownBy(() -> service.register(actor, property.getId(), request)).isInstanceOfSatisfying(
		    ResidentRegistrationException.class,
		    error -> assertThat(error.code()).isEqualTo(ResidentRegistrationException.Code.PHONE_SECURITY_UNAVAILABLE));
		verifyNoInteractions(residents, affiliations);
		clearInvocations(security);
		var optional = new ResidentRegistrationRequest(UUID.randomUUID(), "주민", null, unit.getId(), "OWNER");
		assertThat(service.register(actor, property.getId(), optional).representative()).isTrue();
		verifyNoInteractions(security);
		verify(residents).saveAndFlush(any());
		verify(affiliations).saveAndFlush(any());
	}

	@Test
	void nonManagerCannotReadOrWriteRegistrationData() {
		when(access.getManagementContext(actor, property.getId()))
		    .thenThrow(new AuthException(
		        AuthErrorCode.ACCESS_DENIED));
		assertThatThrownBy(() -> service.register(actor, property.getId(),
		    new ResidentRegistrationRequest(UUID.randomUUID(), "주민", null, unit.getId(), "FAMILY")))
		    .isInstanceOf(AuthException.class);
		verifyNoInteractions(properties, units, buildings, residents, affiliations, security);
	}
}
