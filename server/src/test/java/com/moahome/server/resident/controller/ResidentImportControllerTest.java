package com.moahome.server.resident.controller;

import java.util.*;
import java.time.OffsetDateTime;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.resident.dto.*;
import com.moahome.server.resident.exception.ResidentImportException;
import com.moahome.server.resident.service.ResidentImportService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ResidentImportController.class)
@ActiveProfiles("test")
@Import(ResidentListControllerTest.Security.class)
class ResidentImportControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean ResidentImportService service;
    private final UUID actor = UUID.randomUUID();
    private final UUID property = UUID.randomUUID();
    private final UUID batch = UUID.randomUUID();
    private final String url = "/api/properties/" + property + "/resident-imports";
    private final MockMultipartFile file = new MockMultipartFile("file", "residents.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", new byte[]{1});
    private org.springframework.test.web.servlet.request.RequestPostProcessor identity() {
        return authentication(UsernamePasswordAuthenticationToken.authenticated(new AuthPrincipal(actor.toString(), UUID.randomUUID().toString()), null, List.of()));
    }
    private ResidentImportResponse result() {
        return new ResidentImportResponse(batch, OffsetDateTime.now().plusDays(1), List.of(new ResidentImportResponse.Row(2, "102동", "301", "주민", "FAMILY", "1234", "READY", "등록 가능", false)));
    }

    @Test
    void uploadsMultipartAndReturnsOnlySafeNoStorePreview() throws Exception {
        when(service.preview(eq(actor), eq(property), any())).thenReturn(result());
        mvc.perform(multipart(url).file(file).with(identity())).andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("rows[0].phoneLast4").value("1234"))
            .andExpect(jsonPath("rows[0].phoneEncrypted").doesNotExist())
            .andExpect(jsonPath("rows[0].requestId").doesNotExist());
    }

    @Test
    void commitAcceptsOnlySelectedRowNumbersAndValidatesMissingEmptyOrInvalidSelections() throws Exception {
        when(service.commit(eq(actor), eq(property), eq(batch), any())).thenReturn(result());
        mvc.perform(post(url + "/" + batch + "/commit").with(identity()).contentType("application/json").content("{\"rowNumbers\":[2,4]}"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
        verify(service).commit(eq(actor), eq(property), eq(batch), argThat(input -> input.rowNumbers().equals(List.of(2,4))));
        for (String body : List.of("{}", "{\"rowNumbers\":[]}", "{\"rowNumbers\":[1]}", "{\"rowNumbers\":[null]}", "bad")) {
            mvc.perform(post(url + "/" + batch + "/commit").with(identity()).contentType("application/json").content(body))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("INVALID_REQUEST"));
        }
    }

    @Test
    void rejectsAnonymousMissingFileAndMalformedIdentifiersAndReturnsExpiredCode() throws Exception {
        mvc.perform(multipart(url).file(file)).andExpect(status().isUnauthorized());
        mvc.perform(multipart(url).with(identity())).andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/properties/1-1-1-1-1/resident-imports").file(file).with(identity())).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
        when(service.commit(any(), any(), any(), any())).thenThrow(new ResidentImportException("IMPORT_EXPIRED"));
        mvc.perform(post(url + "/" + batch + "/commit").with(identity()).contentType("application/json").content("{\"rowNumbers\":[2]}"))
            .andExpect(status().isNotFound()).andExpect(jsonPath("code").value("IMPORT_EXPIRED"));
    }
}
