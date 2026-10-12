package com.moahome.server.property.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.*;
import com.moahome.server.auth.exception.*;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.dto.*;
import com.moahome.server.property.exception.UnitManagementException;
import com.moahome.server.property.repo.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class UnitManagementServiceTest {
	private final ManagementAccessService access = mock(ManagementAccessService.class);
	private final PropertyRepository properties = mock(PropertyRepository.class);
	private final BuildingRepository buildings = mock(BuildingRepository.class);
	private final UnitRepository units = mock(UnitRepository.class);
	private final com.moahome.server.resident.service.ResidentListService residents = mock(com.moahome.server.resident.service.ResidentListService.class);
	private final com.moahome.server.resident.service.ResidentManagementService residentManagement = mock(com.moahome.server.resident.service.ResidentManagementService.class);
    private final com.moahome.server.billing.service.BillingGenerationService billing = mock(com.moahome.server.billing.service.BillingGenerationService.class);
    private final UnitManagementService service = new UnitManagementService(access, properties, buildings, units, Clock.systemUTC(), residents, residentManagement, billing);
	private final UUID userId = UUID.randomUUID();
	private final Property property = Property.create("테스트", "주소", null, null, true, OffsetDateTime.now());
	private final Building building = Building.create(property, "101동", 0, OffsetDateTime.now());

    @Test
    void managerCanReadUnitsWithoutReadingOrReceivingAdminOnlyResidents() {
        when(access.getManagementContext(userId, property.getId())).thenReturn(new ManagementPropertyResponse(
            property.getId(), property.getName(), com.moahome.server.membership.domain.PropertyMemberRole.MANAGER));
        when(properties.findById(property.getId())).thenReturn(Optional.of(property));
        var unit = Unit.create(property, building, "301", null, 3, UnitStatus.ACTIVE, OffsetDateTime.now());
        when(units.findByPropertyIdAndDeletedAtIsNull(property.getId())).thenReturn(List.of(unit));
        var response = service.list(userId, property.getId());
        assertThat(response.units()).hasSize(1);
        assertThat(response.residentSummaries()).isNull();
        verifyNoInteractions(residents);
    }

	@Test
	void everyOperationChecksCurrentAccessBeforeReadingOrWritingUnits() {
		doThrow(new AuthException(AuthErrorCode.ACCESS_DENIED)).when(access).getManagementContext(userId, property.getId());
		assertThatThrownBy(() -> service.list(userId, property.getId())).isInstanceOf(AuthException.class);
		assertThatThrownBy(() -> service.create(userId, property.getId(), request(building.getId(), "201"))).isInstanceOf(AuthException.class);
		assertThatThrownBy(() -> service.update(userId, property.getId(), UUID.randomUUID(), request(building.getId(), "201"))).isInstanceOf(AuthException.class);
		assertThatThrownBy(() -> service.createBatch(userId, property.getId(), new UnitBatchRequest(List.of(request(building.getId(), "201"))))).isInstanceOf(AuthException.class);
		assertThatThrownBy(() -> service.createBuilding(userId, property.getId(), new BuildingRequest("102"))).isInstanceOf(AuthException.class);
		assertThatThrownBy(() -> service.updateBuilding(userId, property.getId(), building.getId(), new BuildingRequest("102"))).isInstanceOf(AuthException.class);
		assertThatThrownBy(() -> service.deleteUnits(userId, property.getId(), List.of(UUID.randomUUID()))).isInstanceOf(AuthException.class);
		assertThatThrownBy(() -> service.deleteBuilding(userId, property.getId(), building.getId())).isInstanceOf(AuthException.class);
		verifyNoInteractions(properties, buildings, units);
	}

	@Test
	void validatesBuildingOwnershipAndRejectsDuplicateBeforeSave() {
		when(properties.findForUnitUpdate(property.getId())).thenReturn(Optional.of(property));
		when(buildings.findByIdAndPropertyIdAndDeletedAtIsNull(building.getId(), property.getId())).thenReturn(Optional.empty());
		assertCode(() -> service.create(userId, property.getId(), request(building.getId(), "201")), "INVALID_REQUEST");
		verifyNoInteractions(units);
		when(buildings.findByIdAndPropertyIdAndDeletedAtIsNull(building.getId(), property.getId())).thenReturn(Optional.of(building));
		when(units.existsByPropertyIdAndBuildingIdAndUnitNumberAndIdNot(eq(property.getId()), eq(building.getId()), eq("201"), any()))
			.thenReturn(true);
		assertCode(() -> service.create(userId, property.getId(), request(building.getId(), "201")), "DUPLICATE_UNIT");
		verify(units, never()).saveAndFlush(any());
	}

	@Test
	void updateKeepsIdentityAndRejectsUnitOutsideRequestedProperty() {
		when(properties.findForUnitUpdate(property.getId())).thenReturn(Optional.of(property));
		when(buildings.findByIdAndPropertyIdAndDeletedAtIsNull(building.getId(), property.getId())).thenReturn(Optional.of(building));
		var unit = Unit.create(property, building, "201", null, 2, UnitStatus.ACTIVE, OffsetDateTime.now());
		when(units.findByIdAndPropertyIdAndDeletedAtIsNull(unit.getId(), property.getId())).thenReturn(Optional.of(unit));
		var response = service.update(userId, property.getId(), unit.getId(), new UnitRequest(building.getId(), "001호", "별칭", -1, "VACANT"));
		assertThat(response.id()).isEqualTo(unit.getId());
		assertThat(response.unitNumber()).isEqualTo("001호");
		assertThat(response.floor()).isEqualTo((short) -1);
		assertThat(response.status()).isEqualTo(UnitStatus.VACANT);
		verify(units, never()).saveAndFlush(any());
		assertCode(() -> service.update(userId, property.getId(), UUID.randomUUID(), request(building.getId(), "301")), "UNIT_NOT_FOUND");
	}

	@Test
	void noBuildingsRequiresNullReferenceAndPreservesTextNumber() {
		var without = Property.create("동 없음", "주소", null, null, false, OffsetDateTime.now());
		when(properties.findForUnitUpdate(without.getId())).thenReturn(Optional.of(without));
		assertCode(() -> service.create(userId, without.getId(), request(building.getId(), "001")), "INVALID_REQUEST");
		when(units.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
		var response = service.create(userId, without.getId(), request(null, " 001 "));
		assertThat(response.unitNumber()).isEqualTo("001");
		assertThat(response.buildingId()).isNull();
		verifyNoInteractions(buildings);
	}

	@Test
	void batchValidatesEveryNumberBeforePersistingAndLoadsBuildingOnce() {
		when(properties.findForUnitUpdate(property.getId())).thenReturn(Optional.of(property));
		when(buildings.findByIdAndPropertyIdAndDeletedAtIsNull(building.getId(), property.getId())).thenReturn(Optional.of(building));
		assertCode(() -> service.createBatch(userId, property.getId(), new UnitBatchRequest(List.of(
			request(building.getId(), "201"), request(building.getId(), " 201 ")))), "DUPLICATE_UNIT");
		verify(units, never()).saveAllAndFlush(any());
		verify(buildings, times(1)).findByIdAndPropertyIdAndDeletedAtIsNull(building.getId(), property.getId());
		var stored = Unit.create(property, building, "202", null, 2, UnitStatus.ACTIVE, OffsetDateTime.now());
		when(units.findByPropertyId(property.getId())).thenReturn(List.of(stored));
		assertCode(() -> service.createBatch(userId, property.getId(), new UnitBatchRequest(List.of(
			request(building.getId(), "201"), request(building.getId(), "202")))), "DUPLICATE_UNIT");
		verify(units, never()).saveAllAndFlush(any());
	}

	@Test
	void buildingAdditionAndRenameKeepIdentityAndCheckDuplicateNames() {
		when(properties.findForUnitUpdate(property.getId())).thenReturn(Optional.of(property));
		when(buildings.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
		var created = service.createBuilding(userId, property.getId(), new BuildingRequest(" 102 "));
		assertThat(created.name()).isEqualTo("102동");
		when(buildings.findByIdAndPropertyIdAndDeletedAtIsNull(building.getId(), property.getId())).thenReturn(Optional.of(building));
		var updated = service.updateBuilding(userId, property.getId(), building.getId(), new BuildingRequest("A"));
		assertThat(updated.id()).isEqualTo(building.getId());
		assertThat(updated.name()).isEqualTo("A동");
		when(buildings.existsByPropertyIdAndNameAndDeletedAtIsNullAndIdNot(eq(property.getId()), eq("중복동"), any())).thenReturn(true);
		assertCode(() -> service.createBuilding(userId, property.getId(), new BuildingRequest("중복")), "DUPLICATE_BUILDING");
	}

	@Test
	void deletionValidatesAllTargetsBeforeMutationAndPreservesFirstDeletionMetadata() {
		when(properties.findForUnitUpdate(property.getId())).thenReturn(Optional.of(property));
		var unit = Unit.create(property, building, "201", "별칭", 2, UnitStatus.ACTIVE, OffsetDateTime.now());
		var missing = UUID.randomUUID();
		when(units.findByPropertyIdAndIdIn(eq(property.getId()), any())).thenReturn(List.of(unit));
		assertCode(() -> service.deleteUnits(userId, property.getId(), List.of(unit.getId(), missing)), "UNIT_NOT_FOUND");
		assertThat(unit.getDeletedAt()).isNull();
		verify(units, never()).flush();
		service.deleteUnits(userId, property.getId(), List.of(unit.getId(), unit.getId()));
		var firstDeletion = unit.getDeletedAt();
		assertThat(firstDeletion).isNotNull();
		assertThat(unit.getDeletedBy()).isEqualTo(userId);
		assertThat(unit.getUnitNumber()).isEqualTo("201");
		assertThat(unit.getDisplayName()).isEqualTo("별칭");
		assertThat(unit.getStatus()).isEqualTo(UnitStatus.ACTIVE);
		service.deleteUnits(userId, property.getId(), List.of(unit.getId()));
		assertThat(unit.getDeletedAt()).isEqualTo(firstDeletion);
	}

	@Test
	void buildingDeletionUsesPropertyScopeAndDeletesConnectedUnitsAtTheSameTime() {
		when(properties.findForUnitUpdate(property.getId())).thenReturn(Optional.of(property));
		assertCode(() -> service.deleteBuilding(userId, property.getId(), building.getId()), "UNIT_NOT_FOUND");
		verifyNoInteractions(units);
		when(buildings.findByIdAndPropertyId(building.getId(), property.getId())).thenReturn(Optional.of(building));
		when(buildings.countByPropertyIdAndDeletedAtIsNull(property.getId())).thenReturn(2L);
		var unit = Unit.create(property, building, "201", null, null, UnitStatus.VACANT, OffsetDateTime.now());
		when(units.findByPropertyId(property.getId())).thenReturn(List.of(unit));
		service.deleteBuilding(userId, property.getId(), building.getId());
		assertThat(building.getDeletedBy()).isEqualTo(userId);
		assertThat(unit.getDeletedAt()).isEqualTo(building.getDeletedAt());
		assertThat(unit.getDeletedBy()).isEqualTo(userId);
		when(buildings.countByPropertyIdAndDeletedAtIsNull(property.getId())).thenReturn(1L);
		service.deleteBuilding(userId, property.getId(), building.getId());
		verify(residentManagement, times(2)).deleteForUnits(eq(userId), eq(property.getId()), eq(List.of(unit.getId())), any());
        verify(billing, times(2)).cancelCurrentMonthUnits(eq(userId), eq(property.getId()), eq(List.of(unit.getId())), any());
	}

	@Test
	void lastBuildingDeletionIsRejectedBeforeTouchingConnectedUnits() {
		when(properties.findForUnitUpdate(property.getId())).thenReturn(Optional.of(property));
		when(buildings.findByIdAndPropertyId(building.getId(), property.getId())).thenReturn(Optional.of(building));
		when(buildings.countByPropertyIdAndDeletedAtIsNull(property.getId())).thenReturn(1L);
		assertCode(() -> service.deleteBuilding(userId, property.getId(), building.getId()), "LAST_BUILDING_NOT_DELETABLE");
		assertThat(building.getDeletedAt()).isNull();
		verifyNoInteractions(units);
		verify(buildings, never()).flush();
	}

	private UnitRequest request(UUID buildingId, String number) {
		return new UnitRequest(buildingId, number, null, null, "ACTIVE");
	}

	private void assertCode(org.assertj.core.api.ThrowableAssert.ThrowingCallable action, String code) {
		assertThatThrownBy(action).isInstanceOfSatisfying(UnitManagementException.class,
			error -> assertThat(error.code().name()).isEqualTo(code));
	}
}
