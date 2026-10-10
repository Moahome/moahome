package com.moahome.server.resident.controller;

import java.util.*;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.auth.exception.*;
import com.moahome.server.resident.dto.*;
import com.moahome.server.resident.service.ResidentExportService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ResidentExportController.class)
@ActiveProfiles("test")
@Import(ResidentListControllerTest.Security.class)
class ResidentExportControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean ResidentExportService service;
    private final UUID actor = UUID.randomUUID(), property = UUID.randomUUID(), resident = UUID.randomUUID();
    private final String url = "/api/properties/" + property + "/residents/export";

    private org.springframework.test.web.servlet.request.RequestPostProcessor identity() {
        return authentication(UsernamePasswordAuthenticationToken.authenticated(new AuthPrincipal(actor.toString(), UUID.randomUUID().toString()), null, List.of()));
    }

    @Test
    void explicitPostReturnsOnlyThreeFieldsWithNoStore() throws Exception {
        when(service.export(eq(actor), eq(property), any())).thenReturn(new ResidentExportResponse(List.of(new ResidentExportResponse.Row("주민", "+821012345678", "301호"))));
        mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON).content("{\"residentIds\":[\"%s\"]}".formatted(resident)))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("residents[0].phone").value("+821012345678"))
            .andExpect(jsonPath("residents[0].unitLabel").value("301호"))
            .andExpect(jsonPath("residents[0].length()").value(3))
            .andExpect(jsonPath("residents[0].relationType").doesNotExist())
            .andExpect(jsonPath("residents[0].representative").doesNotExist())
            .andExpect(jsonPath("residents[0].signupStatus").doesNotExist());
    }

    @Test
    void requiresAuthenticationAndRejectsMalformedIdsOrEmptySelection() throws Exception {
        mvc.perform(post(url)).andExpect(status().isUnauthorized());
        for (String input : List.of("{}", "{\"residentIds\":[]}", "{\"residentIds\":[null]}", "{\"residentIds\":[\"invalid\"]}")) {
            mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON).content(input)).andExpect(status().isBadRequest());
        }
        mvc.perform(post("/api/properties/1-1-1-1-1/residents/export").with(identity()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"residentIds\":[\"%s\"]}".formatted(resident))).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void rejectsManagerOrForeignPropertyAccessWithoutReturningContact() throws Exception {
        when(service.export(eq(actor), eq(property), any())).thenThrow(new AuthException(AuthErrorCode.ACCESS_DENIED));
        mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON).content("{\"residentIds\":[\"%s\"]}".formatted(resident)))
            .andExpect(status().isForbidden()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("code").value("ACCESS_DENIED")).andExpect(jsonPath("residents").doesNotExist());
    }
}
