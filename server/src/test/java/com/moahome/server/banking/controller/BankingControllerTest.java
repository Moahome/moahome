package com.moahome.server.banking.controller;

import java.nio.charset.StandardCharsets;
import java.util.*;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.banking.service.BankingService;
import com.moahome.server.payment.exception.PaymentException;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(BankingController.class)
@ActiveProfiles("test")
@Import(BankingControllerTest.Security.class)
class BankingControllerTest {
	@Autowired
	MockMvc mvc;

	@MockitoBean
	BankingService service;

	UUID user = UUID.randomUUID(), property = UUID.randomUUID(), transaction = UUID.randomUUID();

	String base() {
		return "/api/properties/" + property + "/banking";
	}

	RequestPostProcessor identity() {
		return authentication(UsernamePasswordAuthenticationToken
		    .authenticated(new AuthPrincipal(user.toString(), UUID.randomUUID().toString()), null, List.of()));
	}

	@Test
	void authenticatesAllEndpointsAndUsesIdentityWithoutCaching() throws Exception {
		mvc.perform(get(base() + "/workspace")).andExpect(status().isUnauthorized());
		mvc.perform(multipart(base() + "/import/preview")).andExpect(status().isUnauthorized());
		mvc.perform(multipart(base() + "/import")).andExpect(status().isUnauthorized());
		mvc.perform(post(base() + "/transactions/" + transaction + "/expense").contentType(MediaType.APPLICATION_JSON)
		    .content("{}")).andExpect(status().isUnauthorized());
		verifyNoInteractions(service);
		mvc.perform(get(base() + "/workspace").with(identity())).andExpect(status().isOk())
		    .andExpect(header().string("Cache-Control", "no-store"));
		verify(service).workspace(user, property);
	}

	@Test
	void rejectsInvalidNestedAllocationAndAcceptsEmptyOptionalNotes() throws Exception {
		String url = base() + "/transactions/" + transaction + "/expense";
		for (String body : List.of("{}", "{\"category\":\"전기료\",\"mode\":\"RATIO\",\"allocations\":[null]}"))
			mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON).content(body))
			    .andExpect(status().isBadRequest());
		verifyNoInteractions(service);
		mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON).content(
		    "{\"category\":\"청소비\",\"note\":\"\",\"mode\":\"EQUAL\",\"saveAsRule\":false,\"allocations\":[{\"buildingId\":null,\"label\":\"공통\",\"amount\":\"50000\",\"percentage\":\"\"}]}"))
		    .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
		verify(service).confirmExpense(eq(user), eq(property), eq(transaction),
		    argThat(r -> r.note() == null && r.allocations().getFirst().percentage() == null));
	}

	/** 일반 출금은 이체 표시를 생략하는 실제 프론트 요청 형식으로 multipart 변환까지 검증합니다. */
	@Test
	void importsNormalExpenseWithoutOptionalTransferFlag() throws Exception {
		var file = new MockMultipartFile("file", "은행.csv", "text/csv",
		    "거래일,입금액,출금액,적요".getBytes(StandardCharsets.UTF_8));
		var selection = new MockMultipartFile("selection", "selection.json",
		    "application/json",
		    ("{\"rows\":[{\"id\":\"" + transaction
		        + "\",\"expense\":{\"category\":\"전기료\",\"note\":\"\",\"mode\":\"AMOUNT\",\"saveAsRule\":false,\"allocations\":[{\"buildingId\":null,\"label\":\"외부\",\"amount\":\"182690\",\"percentage\":\"\"}]}}]}")
		        .getBytes(StandardCharsets.UTF_8));
		mvc.perform(multipart(base() + "/import").file(file).file(selection).with(identity()))
		    .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
		verify(service).upload(eq(user), eq(property), any(), argThat(r -> !r.rows().getFirst().transfer()
		    && r.rows().getFirst().expense().allocations().getFirst().percentage() == null));
	}

	@Test
	void rejectsMissingSelectionAndInvalidPreviewIdBeforeService() throws Exception {
		var file = new MockMultipartFile("file", "은행.csv", "text/csv",
		    "거래일,입금액,출금액,적요".getBytes(StandardCharsets.UTF_8));
		mvc.perform(multipart(base() + "/import").file(file).with(identity())).andExpect(status().isBadRequest());
		var selection = new MockMultipartFile("selection", "selection.json",
		    "application/json", "{\"rows\":[{\"id\":\"invalid\"}]}".getBytes(StandardCharsets.UTF_8));
		mvc.perform(multipart(base() + "/import").file(file).file(selection).with(identity()))
		    .andExpect(status().isBadRequest());
		verifyNoInteractions(service);
	}

	/** 생략 기본값을 허용해도 명시한 이체 여부를 바꾸거나 잘못된 문자열을 통과시키지 않습니다. */
	@Test
	void preservesExplicitTransferFlagAndRejectsInvalidBooleanText() throws Exception {
		var file = new MockMultipartFile("file", "은행.csv", "text/csv",
		    "거래일,입금액,출금액,적요".getBytes(StandardCharsets.UTF_8));
		for (String flag : List.of("true", "false", "null")) {
			clearInvocations(service);
			var selection = new MockMultipartFile("selection", "selection.json",
			    "application/json", ("{\"rows\":[{\"id\":\"" + transaction + "\",\"transfer\":" + flag + "}]}")
			        .getBytes(StandardCharsets.UTF_8));
			mvc.perform(multipart(base() + "/import").file(file).file(selection).with(identity()))
			    .andExpect(status().isOk());
			verify(service).upload(eq(user), eq(property), any(),
			    argThat(r -> r.rows().getFirst().transfer() == Boolean.parseBoolean(flag)));
		}
		clearInvocations(service);
		var invalid = new MockMultipartFile("selection", "selection.json",
		    "application/json", ("{\"rows\":[{\"id\":\"" + transaction + "\",\"transfer\":\"not-a-boolean\"}]}")
		        .getBytes(StandardCharsets.UTF_8));
		mvc.perform(multipart(base() + "/import").file(file).file(invalid).with(identity()))
		    .andExpect(status().isBadRequest());
		verifyNoInteractions(service);
	}

	@Test
	void validatesBankDeletionSelectionAndRequiresAuthentication() throws Exception {
		var url = base() + "/transactions/delete";
		mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content("{}"))
		    .andExpect(status().isUnauthorized());
		for (String input : List.of("{}", "{\"transactionIds\":[]}", "{\"transactionIds\":[null]}"))
			mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON).content(input))
			    .andExpect(status().isBadRequest());
		verifyNoInteractions(service);
		mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON)
		    .content("{\"transactionIds\":[\"" + transaction + "\"]}")).andExpect(status().isOk())
		    .andExpect(header().string("Cache-Control", "no-store"));
		verify(service).deleteMany(eq(user), eq(property),
		    argThat(r -> r.transactionIds().equals(List.of(transaction))));
	}

	@Test
	void acceptsManualOnlyDeletionAndRejectsNullManualSelection() throws Exception {
		var url = base() + "/transactions/delete";
		mvc.perform(
		    post(url).with(identity()).contentType(MediaType.APPLICATION_JSON).content("{\"paymentIds\":[null]}"))
		    .andExpect(status().isBadRequest());
		mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON)
		    .content("{\"paymentIds\":[\"" + transaction + "\"]}")).andExpect(status().isOk());
		verify(service).deleteMany(eq(user), eq(property),
		    argThat(r -> r.transactionIds().isEmpty() && r.paymentIds().equals(List.of(transaction))));
	}

	@Test
	void incomeAllocationRequiresAuthenticationAndValidNestedShares() throws Exception {
		var url = base() + "/transactions/" + transaction + "/income-allocation";
		mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content("{}"))
		    .andExpect(status().isUnauthorized());
		mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON).content("{}"))
		    .andExpect(status().isBadRequest());
		mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON)
		    .content("{\"category\":\"이자\",\"mode\":\"EQUAL\",\"saveAsRule\":false,\"allocations\":[{\"buildingId\":\""
		        + UUID.randomUUID() + "\"}]}"))
		    .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
		verify(service).confirmIncomeAllocation(eq(user), eq(property), eq(transaction), any());
	}

	@Test
	void unsupportedBankIsBadRequestAndAmbiguousDuplicateIsConflict() throws Exception {
		var file = new MockMultipartFile("file", "은행.xls", "application/vnd.ms-excel", new byte[] { 1 });
		when(service.preview(eq(user), eq(property), any(), any()))
		    .thenThrow(new PaymentException("BANK_IMPORT_UNSUPPORTED"));
		mvc.perform(multipart(base() + "/import/preview").file(file).with(identity()))
		    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("BANK_IMPORT_UNSUPPORTED"))
		    .andExpect(header().string("Cache-Control", "no-store"));
		when(service.preview(eq(user), eq(property), any(), any()))
		    .thenThrow(new PaymentException("BANK_DUPLICATE_REVIEW_REQUIRED"));
		mvc.perform(multipart(base() + "/import/preview").file(file).with(identity()))
		    .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("BANK_DUPLICATE_REVIEW_REQUIRED"));
	}

	/** 수동 출금도 인증·필수 입력·중첩 배분 검증을 통과한 요청만 실제 사용자 ID로 전달합니다. */
	@Test
	void manualExpenseRequiresAuthenticationAndValidatesInputBeforeService() throws Exception {
		var url = base() + "/expenses/manual";
		mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content("{}"))
		    .andExpect(status().isUnauthorized());
		for (String input : List.of("{}", "{\"allocations\":[null]}",
		    "{\"id\":\"invalid\",\"amount\":\"-1\"}"))
			mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON).content(input))
			    .andExpect(status().isBadRequest());
		verifyNoInteractions(service);
		String body = """
		    {"id":"%s","accountId":"%s","date":"2026-10-15","amount":"10000",
		    "category":"청소비","note":"","mode":"EQUAL","allocations":[{"label":"공통"}]}
		    """.formatted(transaction, UUID.randomUUID());
		mvc.perform(post(url).with(identity()).contentType(MediaType.APPLICATION_JSON).content(body))
		    .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
		verify(service).manualExpense(eq(user), eq(property), argThat(r -> r.id().equals(transaction)
		    && r.note() == null && r.amount().equals("10000") && !r.expense().saveAsRule()));
	}

	@TestConfiguration
	static class Security {
		@Bean
		SecurityFilterChain testSecurity(HttpSecurity http) throws Exception {
			return http.csrf(c -> c.disable()).authorizeHttpRequests(a -> a.anyRequest().authenticated())
			    .exceptionHandling(e -> e.authenticationEntryPoint((r, s, x) -> s.setStatus(401))).build();
		}
	}
}
