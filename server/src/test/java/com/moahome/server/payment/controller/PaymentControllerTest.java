package com.moahome.server.payment.controller;
import java.util.*;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.payment.service.PaymentService;
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

@WebMvcTest(PaymentController.class) @ActiveProfiles("test") @Import(PaymentControllerTest.Security.class)
class PaymentControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean PaymentService service;
    UUID user=UUID.randomUUID(),property=UUID.randomUUID(),payment=UUID.randomUUID();
    String base() {return "/api/properties/"+property+"/payments";}
    org.springframework.test.web.servlet.request.RequestPostProcessor identity() {
        return authentication(UsernamePasswordAuthenticationToken.authenticated(new AuthPrincipal(user.toString(),UUID.randomUUID().toString()),null,List.of()));
    }
    @Test void endpointsRequireAuthenticationAndBadInputDoesNotReachService() throws Exception {
        mvc.perform(get(base()+"/workspace")).andExpect(status().isUnauthorized());
        for(String endpoint:List.of("/manual","/delete","/"+payment+"/confirm","/"+payment+"/hold","/"+payment+"/cancel","/"+payment+"/link")) {
            mvc.perform(post(base()+endpoint).contentType(MediaType.APPLICATION_JSON).content("{}" )).andExpect(status().isUnauthorized());
            mvc.perform(post(base()+endpoint).with(identity()).contentType(MediaType.APPLICATION_JSON).content("{}" )).andExpect(status().isBadRequest());
        }
        mvc.perform(post(base()+"/"+payment+"/confirm").with(identity()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"unitId\":\""+UUID.randomUUID()+"\",\"allocations\":[null]}" )).andExpect(status().isBadRequest());
        mvc.perform(multipart(base()+"/import/preview").with(identity())).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
    @Test void workspaceUsesAuthenticatedIdentityAndPreventsBrowserCaching() throws Exception {
        mvc.perform(get(base()+"/workspace").with(identity())).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        verify(service).workspace(user,property);
    }
    @Test void automaticConfirmationRequiresAuthenticationAndUsesAuthenticatedIdentity() throws Exception {
        mvc.perform(post(base()+"/confirm-matches")).andExpect(status().isUnauthorized());
        mvc.perform(post(base()+"/confirm-matches").with(identity())).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        verify(service).confirmMatches(user,property);
    }
    @Test void deletionRequiresAuthenticationAndReturnsUpdatedLedger() throws Exception {
        mvc.perform(delete(base()+"/"+payment)).andExpect(status().isUnauthorized());
        mvc.perform(delete(base()+"/"+payment).with(identity())).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        verify(service).delete(user,property,payment);
    }
    @Test void selectedDeletionUsesAuthenticatedIdentityAndRejectsInvalidLists() throws Exception {
        mvc.perform(post(base()+"/delete").with(identity()).contentType(MediaType.APPLICATION_JSON).content("{\"paymentIds\":[]}")).andExpect(status().isBadRequest());
        mvc.perform(post(base()+"/delete").with(identity()).contentType(MediaType.APPLICATION_JSON).content("{\"paymentIds\":[null]}")).andExpect(status().isBadRequest());
        mvc.perform(post(base()+"/delete").with(identity()).contentType(MediaType.APPLICATION_JSON).content("{\"paymentIds\":[\""+payment+"\"]}")).andExpect(status().isOk());
        verify(service).deleteMany(user,property,new com.moahome.server.payment.dto.PaymentRequests.DeleteMany(List.of(payment)));
    }
    @Test void unitOnlyConfirmationAcceptsOmittedAllocations() throws Exception {
        UUID unit=UUID.randomUUID();
        mvc.perform(post(base()+"/"+payment+"/confirm").with(identity()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"unitId\":\""+unit+"\"}")).andExpect(status().isOk());
        verify(service).confirm(user,property,payment,new com.moahome.server.payment.dto.PaymentRequests.Confirm(unit,null,null));
    }
    @TestConfiguration static class Security {
        @Bean SecurityFilterChain testSecurity(HttpSecurity http) throws Exception {
            return http.csrf(csrf->csrf.disable()).authorizeHttpRequests(auth->auth.anyRequest().authenticated())
                .exceptionHandling(errors->errors.authenticationEntryPoint((request,response,error)->response.setStatus(401))).build();
        }
    }
}
