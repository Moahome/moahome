package com.moahome.server.resident.service;

import java.time.OffsetDateTime;
import java.util.*;
import com.moahome.server.auth.exception.*;
import com.moahome.server.common.security.PhoneSecurity;
import com.moahome.server.resident.domain.*;
import com.moahome.server.resident.dto.*;
import com.moahome.server.resident.repo.ResidentRepository;
import com.moahome.server.resident.exception.ResidentRegistrationException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ResidentExportServiceTest {
    private final ResidentListService lists = mock(ResidentListService.class);
    private final ResidentRepository residents = mock(ResidentRepository.class);
    private final ObjectProvider<PhoneSecurity> phones = mock();
    private final PhoneSecurity security = mock(PhoneSecurity.class);
    private final ResidentExportService service = new ResidentExportService(lists, residents, phones);
    private final UUID actor = UUID.randomUUID(), property = UUID.randomUUID(), first = UUID.randomUUID(), second = UUID.randomUUID(), building = UUID.randomUUID();

    @Test
    void exportsOnlyRequestedRowsInRequestOrderWithFullPhoneAndCurrentUnitLabel() {
        when(lists.list(actor, property)).thenReturn(directory());
        when(residents.findByPropertyIdAndIdInAndDeletedAtIsNull(property, List.of(second, first)))
            .thenReturn(List.of(resident(first, null), resident(second, "encrypted")));
        when(phones.getObject()).thenReturn(security);
        when(security.decrypt("encrypted")).thenReturn("+821012345678");
        var result = service.export(actor, property, new ResidentExportRequest(List.of(second, first)));
        assertThat(result.residents()).containsExactly(new ResidentExportResponse.Row("둘째", "+821012345678", "102동 301호"),
            new ResidentExportResponse.Row("첫째", null, "—"));
        verify(residents).findByPropertyIdAndIdInAndDeletedAtIsNull(property, List.of(second, first));
        assertThat(result.toString()).doesNotContain("8210", "둘째");
        assertThat(result.residents().getFirst().toString()).doesNotContain("8210", "둘째");
    }

    @Test
    void rejectsDeniedAccessBeforeAnyPrivateContactRead() {
        when(lists.list(actor, property)).thenThrow(new AuthException(AuthErrorCode.ACCESS_DENIED));
        assertThatThrownBy(() -> service.export(actor, property, new ResidentExportRequest(List.of(first)))).isInstanceOf(AuthException.class);
        verifyNoInteractions(residents, phones, security);
    }

    @Test
    void rejectsDuplicateForeignOrDeletedIdsInsteadOfReturningPartialFile() {
        when(lists.list(actor, property)).thenReturn(directory());
        assertThatThrownBy(() -> service.export(actor, property, new ResidentExportRequest(List.of(first, first)))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.export(actor, property, new ResidentExportRequest(List.of(UUID.randomUUID()))))
            .isInstanceOfSatisfying(ResidentRegistrationException.class, error -> assertThat(error.code()).isEqualTo(ResidentRegistrationException.Code.RESIDENT_NOT_FOUND));
        verifyNoInteractions(residents, phones);
        when(residents.findByPropertyIdAndIdInAndDeletedAtIsNull(property, List.of(first, second))).thenReturn(List.of(resident(first, null)));
        assertThatThrownBy(() -> service.export(actor, property, new ResidentExportRequest(List.of(first, second)))).isInstanceOf(ResidentRegistrationException.class);
        verifyNoInteractions(phones);
    }

    @Test
    void skipsSecurityForMissingPhoneAndConvertsDecryptionFailureToSafeError() {
        when(lists.list(actor, property)).thenReturn(directory());
        when(residents.findByPropertyIdAndIdInAndDeletedAtIsNull(property, List.of(first))).thenReturn(List.of(resident(first, null)));
        assertThat(service.export(actor, property, new ResidentExportRequest(List.of(first))).residents().getFirst().phone()).isNull();
        verifyNoInteractions(phones);
        when(residents.findByPropertyIdAndIdInAndDeletedAtIsNull(property, List.of(second))).thenReturn(List.of(resident(second, "encrypted")));
        when(phones.getObject()).thenReturn(security);
        when(security.decrypt("encrypted")).thenThrow(new IllegalArgumentException("private phone"));
        assertThatThrownBy(() -> service.export(actor, property, new ResidentExportRequest(List.of(second))))
            .isInstanceOfSatisfying(ResidentRegistrationException.class, error -> assertThat(error.code()).isEqualTo(ResidentRegistrationException.Code.PHONE_SECURITY_UNAVAILABLE))
            .hasMessageNotContaining("private phone");
    }

    private ResidentListResponse directory() {
        return new ResidentListResponse(property, true, List.of(new ResidentListResponse.ResidentBuildingItem(building, "102동")), List.of(
            new ResidentListResponse.ResidentItem(first, "첫째", null, null, null, null, null, false, ResidentSignupStatus.NOT_JOINED),
            new ResidentListResponse.ResidentItem(second, "둘째", "5678", UUID.randomUUID(), building, "301", "OWNER", true, ResidentSignupStatus.APPROVED)));
    }
    private Resident resident(UUID id, String encrypted) {
        return Resident.register(id, property, "저장 주민", encrypted, encrypted == null ? null : "hmac", encrypted == null ? null : "5678", OffsetDateTime.now());
    }
}
