package com.moahome.server.banking.controller;
import java.util.*;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.banking.service.BankingBalanceService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.*;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(BankingBalanceController.class) @ActiveProfiles("test") @Import(BankingBalanceControllerTest.Security.class)
class BankingBalanceControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean BankingBalanceService service;
    UUID user=UUID.randomUUID(),property=UUID.randomUUID();
    String base() { return "/api/properties/"+property+"/banking/balances"; }
    org.springframework.test.web.servlet.request.RequestPostProcessor identity() {
        return authentication(UsernamePasswordAuthenticationToken.authenticated(new AuthPrincipal(user.toString(),UUID.randomUUID().toString()),null,List.of()));
    }
    @Test void authenticatesAndDoesNotCacheBalanceResponses() throws Exception {
        mvc.perform(get(base()).param("month","2026-10")).andExpect(status().isUnauthorized());
        mvc.perform(get(base()).param("month","2026-10").with(identity())).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        verify(service).workspace(user,property,"2026-10",null);
        UUID account=UUID.randomUUID();
        mvc.perform(get(base()).param("month","2026-10").param("accountId",account.toString()).with(identity()))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        verify(service).workspace(user,property,"2026-10",account);
    }
    @Test void rejectsMissingBuildingAmountsAndNonpositiveSettlementInputsBeforeService() throws Exception {
        mvc.perform(post(base()+"/openings").with(identity()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"cutoffDate\":\"2026-09-30\",\"buildings\":[null]}"))
            .andExpect(status().isBadRequest());
        mvc.perform(post(base()+"/settlements").with(identity()).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
    @Test void excludesOnlyWithAuthenticatedExplicitDecisionAndValidRevision() throws Exception {
        mvc.perform(post(base()+"/settlement-decisions").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnauthorized());
        mvc.perform(post(base()+"/settlement-decisions").with(identity()).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest());
        var allocation=UUID.randomUUID();var request=UUID.randomUUID();
        mvc.perform(post(base()+"/settlement-decisions").with(identity()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"id\":\""+request+"\",\"allocationId\":\""+allocation+"\",\"excluded\":true,\"revision\":0}"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        verify(service).decideSettlement(eq(user),eq(property),argThat(r->r.id().equals(request)&&r.allocationId().equals(allocation)&&r.excluded()&&r.revision()==0));
    }
    @Test void validatesCorrectionAmountsAndRevision() throws Exception {
        mvc.perform(post(base()+"/openings/corrections").with(identity()).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest());
        mvc.perform(post(base()+"/openings/corrections").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }
    @TestConfiguration static class Security {
        @Bean SecurityFilterChain testSecurity(HttpSecurity http) throws Exception {
            return http.csrf(c->c.disable()).authorizeHttpRequests(a->a.anyRequest().authenticated())
                .exceptionHandling(e->e.authenticationEntryPoint((r,s,x)->s.setStatus(401))).build();
        }
    }
}
