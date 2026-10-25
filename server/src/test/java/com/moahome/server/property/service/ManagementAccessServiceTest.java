package com.moahome.server.property.service;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.membership.repo.PropertyMemberRepository;
import com.moahome.server.membership.repo.PropertyMemberRepository.ManagementProperty;
import com.moahome.server.property.dto.ManagementPropertyResponse;
import com.moahome.server.resident.repo.ResidentRepository;
import com.moahome.server.user.exception.UserErrorCode;
import com.moahome.server.user.exception.UserException;
import com.moahome.server.user.service.UserService;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ManagementAccessServiceTest {
	private final UserService users = mock(UserService.class);

	private final PropertyMemberRepository members = mock(PropertyMemberRepository.class);

	private final ResidentRepository residents = mock(ResidentRepository.class);

	private final ManagementAccessService service = new ManagementAccessService(users, members, residents);

	private final UUID userId = UUID.randomUUID();

	private final UUID propertyId = UUID.randomUUID();

	@Test
	void listsCurrentTargetsWithoutRegistrationHistoryAndKeepsRepositoryOrder() {
		var first = row(propertyId, PropertyMemberRole.MANAGER);
		var second = row(UUID.randomUUID(), PropertyMemberRole.ADMIN);
		when(members.findManagedProperties(userId)).thenReturn(List.of(first, second, first));
		List<ManagementPropertyResponse> result = service.getManagedProperties(userId).properties();
		assertThat(result).extracting(p -> p.propertyId()).containsExactly(propertyId, second.getPropertyId());
		assertThat(result.getFirst().role()).isEqualTo(PropertyMemberRole.MANAGER);
		verify(users).requireActive(userId);
	}

	@Test
	void returnsEmptyOnlyForSuccessfulEmptyQueryAndDeniesMissingContext() {
		when(members.findManagedProperties(userId)).thenReturn(List.of());
		when(members.findManagementContext(userId, propertyId)).thenReturn(List.of());
		assertThat(service.getManagedProperties(userId).properties()).isEmpty();
		assertThatThrownBy(() -> service.getManagementContext(userId, propertyId)).isInstanceOfSatisfying(
		    AuthException.class, e -> assertThat(e.code()).isEqualTo(AuthErrorCode.ACCESS_DENIED));
	}

	@Test
	void currentContextUsesBothIdentityAndRequestedTarget() {
		var current = row(propertyId, PropertyMemberRole.ADMIN);
		when(members.findManagementContext(userId, propertyId)).thenReturn(List.of(current));
		assertThat(service.getManagementContext(userId, propertyId).propertyId()).isEqualTo(propertyId);
		verify(members).findManagementContext(userId, propertyId);
		verify(members, never()).findManagedProperties(any());
	}

	@Test
	void accountRejectionStopsMembershipLookup() {
		doThrow(new UserException(UserErrorCode.USER_NOT_FOUND)).when(users).requireActive(userId);
		assertThatThrownBy(() -> service.getManagedProperties(userId)).isInstanceOf(UserException.class);
		verifyNoInteractions(members);
	}

	@Test
	void distinguishesAccountStorageFailureFromMembershipQueryFailure() {
		doThrow(new DataAccessResourceFailureException("private SQL")).when(users).requireActive(userId);
		assertThatThrownBy(() -> service.getManagedProperties(userId)).isInstanceOfSatisfying(AuthException.class,
		    e -> assertThat(e.code()).isEqualTo(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE));
		reset(users);
		when(members.findManagedProperties(userId)).thenThrow(new DataAccessResourceFailureException("private SQL"));
		assertThatThrownBy(() -> service.getManagedProperties(userId))
		    .isInstanceOf(DataAccessResourceFailureException.class);
	}

	@Test
	void conflictingRolesDoNotSilentlySelectAnAdministrator() {
		List<ManagementProperty> conflicting = List.of(row(propertyId, PropertyMemberRole.ADMIN),
		    row(propertyId, PropertyMemberRole.MANAGER));
		when(members.findManagedProperties(userId)).thenReturn(conflicting);
		when(members.findManagementContext(userId, propertyId)).thenReturn(conflicting);
		assertThatThrownBy(() -> service.getManagedProperties(userId)).isInstanceOf(IllegalStateException.class);
		assertThatThrownBy(() -> service.getManagementContext(userId, propertyId))
		    .isInstanceOf(IllegalStateException.class);
	}

	@Test
	void accessContextSeparatesCurrentRoleFromResidentEligibility() {
		for (var role : PropertyMemberRole.values()) {
			var current = row(propertyId, role);
			when(members.findAccessContext(userId, propertyId)).thenReturn(List.of(current));
			when(residents.hasApprovedResident(propertyId, userId)).thenReturn(false);
			var context = service.getPropertyAccessContext(userId, propertyId);
			assertThat(context.role()).isEqualTo(role);
			assertThat(context.residentEligible()).isFalse();
			when(residents.hasApprovedResident(propertyId, userId)).thenReturn(true);
			assertThat(service.getPropertyAccessContext(userId, propertyId).residentEligible()).isTrue();
		}
	}

	@Test
	void accessContextRejectsMissingAndConflictingRolesBeforeReadingResidentData() {
		when(members.findAccessContext(userId, propertyId)).thenReturn(List.of());
		assertThatThrownBy(() -> service.getPropertyAccessContext(userId, propertyId))
		    .isInstanceOf(AuthException.class);
		List<ManagementProperty> conflicts = List.of(row(propertyId, PropertyMemberRole.RESIDENT), row(propertyId, PropertyMemberRole.MANAGER));
		when(members.findAccessContext(userId, propertyId)).thenReturn(conflicts);
		assertThatThrownBy(() -> service.getPropertyAccessContext(userId, propertyId))
		    .isInstanceOf(IllegalStateException.class);
		verifyNoInteractions(residents);
	}

	private ManagementProperty row(UUID id, PropertyMemberRole role) {
		var row = mock(ManagementProperty.class);
		when(row.getPropertyId()).thenReturn(id);
		when(row.getName()).thenReturn("관리대상");
		when(row.getRole()).thenReturn(role);
		return row;
	}
}
