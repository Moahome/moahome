package com.moahome.server.auth.security;

import com.moahome.server.expense.service.PayableService;
import com.moahome.server.expense.service.PayableSourceService;
import com.moahome.server.banking.service.BankTransferPostingService;
import com.moahome.server.accounting.service.AccountingWriteService;
import com.moahome.server.accounting.service.AccountingAccountSettingsService;
import com.moahome.server.accounting.service.AccountingTransferService;
import com.moahome.server.accounting.service.IncomeStatementService;
import com.moahome.server.billing.service.BillingIncomeSourceService;
import jakarta.persistence.EntityManager;
import com.moahome.server.systemadmin.service.SystemAdminService;
import com.moahome.server.systemadmin.repo.SystemAdminRequestLock;
import com.moahome.server.notice.repo.NoticeRepository;
import com.moahome.server.notice.repo.ResidentNoticeRepository;
import com.moahome.server.notice.dto.ResidentNoticeResponse;
import com.moahome.server.common.security.Sha256;
import com.moahome.server.notice.repo.NoticeAssetRepository;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.Optional;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import jakarta.servlet.http.Cookie;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.ObjectMapper;

import com.moahome.server.auth.controller.AppAuthController;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.auth.domain.ClientType;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.repo.RedisAuthSessionRepository;
import com.moahome.server.auth.repo.SocialAccountRepository;
import com.moahome.server.auth.service.AuthService;
import com.moahome.server.auth.service.TokenService;
import com.moahome.server.auth.support.MutableClock;
import com.moahome.server.auth.support.RedisTestServer;
import com.moahome.server.banking.service.BankAccountService;
import com.moahome.server.banking.service.BankBalanceCheckService;
import com.moahome.server.banking.service.BankingBalanceService;
import com.moahome.server.banking.service.BankingService;
import com.moahome.server.banking.service.IncomeAllocationService;
import com.moahome.server.billing.service.BillingGenerationService;
import com.moahome.server.billing.service.BillingService;
import com.moahome.server.billing.service.BillingTemplates;
import com.moahome.server.billing.service.OpeningBalanceService;
import com.moahome.server.billing.service.InitialBalanceCorrections;
import com.moahome.server.billing.service.BankBillingStartService;
import com.moahome.server.expense.service.ExpenseService;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.membership.dto.SignupRequests;
import com.moahome.server.membership.service.MemberManagementService;
import com.moahome.server.membership.service.MembershipRequestService;
import com.moahome.server.membership.service.ResidentInvitationService;
import com.moahome.server.membership.service.ResidentJoinCodeService;
import com.moahome.server.payment.service.CumulativePaymentService;
import com.moahome.server.payment.service.PayerMatchService;
import com.moahome.server.payment.service.PaymentService;
import com.moahome.server.property.dto.BasicInfoRequest;
import com.moahome.server.property.dto.ManagedPropertiesResponse;
import com.moahome.server.property.dto.ManagementPropertyResponse;
import com.moahome.server.property.dto.PropertyAccessContextResponse;
import com.moahome.server.property.repo.PropertyRegistrationLock;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.property.service.PropertyRegistrationService;
import com.moahome.server.property.service.RegistrationBankImportService;
import com.moahome.server.property.service.UnitManagementService;
import com.moahome.server.property.support.RegistrationTestKeys;
import com.moahome.server.resident.service.ResidentExportService;
import com.moahome.server.resident.service.ResidentImportService;
import com.moahome.server.resident.service.ResidentImportCommitService;
import com.moahome.server.resident.service.ResidentPhoneRetentionService;
import com.moahome.server.property.service.RegistrationResidentPreviewService;
import com.moahome.server.resident.service.ResidentListService;
import com.moahome.server.resident.service.ResidentManagementService;
import com.moahome.server.resident.service.ResidentRegistrationService;
import com.moahome.server.user.domain.SystemRole;
import com.moahome.server.user.domain.UserStatus;
import com.moahome.server.user.dto.CurrentUserResponse;
import com.moahome.server.user.exception.UserErrorCode;
import com.moahome.server.user.exception.UserException;
import com.moahome.server.user.repo.UserRepository;
import com.moahome.server.user.service.UserService;
import com.moahome.server.user.service.AccountLifecycleService;
import com.moahome.server.user.dto.AccountRecoveryResponse;
import com.moahome.server.user.dto.WithdrawalReceipt;
import com.moahome.server.user.dto.WithdrawalStatus;
import java.time.OffsetDateTime;
import java.util.concurrent.atomic.AtomicLong;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doAnswer;
import com.moahome.server.user.service.ProfileImageService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import org.springframework.http.HttpMethod;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "moahome.billing.scheduler-enabled=false")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import({SecurityIntegrationTest.TestBeans.class, SecurityIntegrationTest.ProbeController.class})
class SecurityIntegrationTest {
	@MockitoBean
	private AccountLifecycleService accountLifecycle;

	private static final String ORIGIN = "http://localhost:3000";

	private static final RedisTestServer REDIS = new RedisTestServer();

	@Autowired
	private MockMvc mvc;

	@Autowired
	private AuthService auth;

	@Autowired
	private TokenService tokens;

	@Autowired
	private StringRedisTemplate redis;

	@Autowired
	private ObjectMapper mapper;

	@Autowired
	private MutableClock clock;

	@MockitoBean
	private ProfileImageService profileImages;

	@MockitoSpyBean
	private RedisAuthSessionRepository sessions;

	@MockitoBean
	private PayableService payables;
	@MockitoBean
	private PayableSourceService payableSources;

	@MockitoBean
	BankTransferPostingService bankTransferPostings;

	@MockitoBean
	private AccountingWriteService accountingWrites;

	@MockitoBean
	private AccountingAccountSettingsService accountingAccounts;

	@MockitoBean
	private AccountingTransferService accountingTransfers;

	@MockitoBean
	private com.moahome.server.accounting.service.ExpenseAccountService expenseAccounts;

	@MockitoBean
	private IncomeStatementService incomeStatements;

	@MockitoBean
	private BillingIncomeSourceService billingIncomeSources;

	@MockitoBean
	private EntityManager entityManager;

	@MockitoBean
	private SystemAdminService systemAdmin;

	@MockitoBean
	private SystemAdminRequestLock systemAdminRequestLock;

	@MockitoBean
	private NoticeRepository noticeRepository;

	@MockitoBean
	private ResidentNoticeRepository residentNoticeRepository;

	@MockitoBean
	private NoticeAssetRepository noticeAssetRepository;

	@MockitoBean
	private ResidentInvitationService residentInvitations;

	@MockitoBean
	private ResidentJoinCodeService residentJoinCodes;

	@MockitoBean
	private PaymentService payments;

	@MockitoBean
	private PayerMatchService payerMatches;

	@MockitoBean
	private BankingService banking;

	@MockitoBean
	private IncomeAllocationService incomeAllocations;

	@MockitoBean
	private BankingBalanceService bankingBalances;

	@MockitoBean
	private BankBalanceCheckService bankBalanceChecks;

	@MockitoBean
	private BankAccountService bankAccountSettings;

	@MockitoBean
	private ExpenseService expenses;

	@MockitoBean
	private RegistrationBankImportService registrationBankImports;

	@MockitoBean
	private CumulativePaymentService cumulativePayments;

	@MockitoBean
	private BillingService billing;

	@MockitoBean
	private OpeningBalanceService openingBalances;

	@MockitoBean
	private InitialBalanceCorrections initialBalanceCorrections;

	@MockitoBean
	private BankBillingStartService bankBillingStart;

	@MockitoBean
	private MemberManagementService memberManagement;

	@MockitoBean
	private MembershipRequestService membershipRequests;

	@MockitoBean
	private BillingTemplates billingTemplates;

	@MockitoBean
	private BillingGenerationService billingGeneration;

	@MockitoBean
	private ManagementAccessService management;

	@MockitoBean
	private UnitManagementService unitManagement;

	@MockitoBean
	private ResidentListService residentList;

	@MockitoBean
	private ResidentRegistrationService residentRegistration;

	@MockitoBean
	private ResidentImportService residentImport;

	@MockitoBean
	private ResidentImportCommitService residentImportCommits;

	@MockitoBean
	private ResidentPhoneRetentionService phoneRetention;

	@MockitoBean
	private RegistrationResidentPreviewService registrationResidentPreview;

	@MockitoBean
	private ResidentManagementService residentManagement;

	@MockitoBean
	private ResidentExportService residentExport;

	@MockitoBean
	private UserService users;

	@MockitoBean
	private UserRepository userRepository;

	@MockitoBean
	private SocialAccountRepository socialAccounts;

	@MockitoBean
	private PropertyRegistrationService registrations;

	@MockitoBean
	private PropertyRegistrationLock registrationLock;

	@DynamicPropertySource
	static void infrastructure(DynamicPropertyRegistry registry) {
		RegistrationTestKeys.register(registry);
		byte[] accessKey = new byte[64];
		byte[] refreshKey = new byte[64];
		SecureRandom random = new SecureRandom();
		random.nextBytes(accessKey);
		random.nextBytes(refreshKey);
		String accessSecret = Base64.getEncoder().encodeToString(accessKey);
		String refreshSecret = Base64.getEncoder().encodeToString(refreshKey);
		registry.add("moahome.security.jwt-access-secret-base64", () -> accessSecret);
		registry.add("moahome.security.jwt-refresh-secret-base64", () -> refreshSecret);
		registry.add("spring.data.redis.port", REDIS::port);
	}

	@BeforeEach
	void resetTime() {
		clock.set(Instant.now().truncatedTo(ChronoUnit.SECONDS));
	}

	@AfterEach
	void resetSpies() {
		reset(sessions, users);
	}

	@AfterAll
	static void stopRedis() {
		REDIS.close();
	}

	/** 운영 점검에는 상태만 공개하며 상세 설정·다른 경로와 쓰기 요청으로 허용 범위를 넓히지 않습니다. */
	@Test
	void healthExposesOnlyStatusAndKeepsOtherManagementPathsProtected() throws Exception {
		mvc.perform(get("/actuator/health")).andExpect(status().isOk())
		    .andExpect(jsonPath("$.status").value("UP"))
		    .andExpect(jsonPath("$.components").doesNotExist())
		    .andExpect(jsonPath("$.details").doesNotExist());
		for (String path : List.of("/actuator/env", "/actuator/health/redis", "/actuator/metrics", "/api/users/me")) {
			mvc.perform(get(path)).andExpect(status().isUnauthorized());
		}
		mvc.perform(post("/actuator/health")).andExpect(status().isUnauthorized());
	}

	/** 익명 읽기 쿠키는 별도 Origin 검증을 거치며 관리자 Bearer 권한을 대신하지 않습니다. */
	@Test
	void residentNoticeSessionRequiresLinkAndOriginAndCannotAccessManagement() throws Exception {
		UUID grantId = UUID.randomUUID();
		UUID property = UUID.randomUUID();
		byte[] randomToken = new byte[32];
		new SecureRandom().nextBytes(randomToken);
		String token = grantId + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(randomToken);
		var grant = new ResidentNoticeRepository.Grant(grantId, property, "unused", Sha256.hex(token),
		    OffsetDateTime.now(), null);
		when(residentNoticeRepository.findGrant(grantId)).thenReturn(Optional.of(grant));
		when(residentNoticeRepository.context(property))
		    .thenReturn(Optional.of(new ResidentNoticeResponse.Context(property, "주민 건물")));
		mvc.perform(get("/api/notice-access/context")).andExpect(status().isUnauthorized())
		    .andExpect(jsonPath("code").value("NOTICE_ACCESS_REQUIRED"));
		String body = "{\"token\":\"" + token + "\"}";
		mvc.perform(post("/api/notice-access/sessions").contentType(MediaType.APPLICATION_JSON).content(body))
		    .andExpect(status().isForbidden());
		mvc.perform(post("/api/notice-access/sessions").header("Origin", "https://evil.example")
		    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
		var response = mvc.perform(post("/api/notice-access/sessions").header("Origin", "https://app.example.test")
		    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isNoContent())
		    .andExpect(header().string("Cache-Control", "no-store"))
		    .andExpect(cookie().httpOnly("moahome-notice-access", true))
		    .andExpect(cookie().secure("moahome-notice-access", true))
		    .andExpect(cookie().path("moahome-notice-access", "/api/notice-access"))
		    .andExpect(cookie().maxAge("moahome-notice-access", 43200)).andReturn().getResponse();
		Cookie guest = response.getCookie("moahome-notice-access");
		mvc.perform(get("/api/notice-access/context").cookie(guest)).andExpect(status().isOk())
		    .andExpect(jsonPath("propertyId").value(property.toString()));
		mvc.perform(get("/api/properties/" + property + "/notices").cookie(guest))
		    .andExpect(status().isUnauthorized());
		mvc.perform(put("/api/notice-access/notices/" + UUID.randomUUID()).cookie(guest))
		    .andExpect(status().isUnauthorized());
	}

	/** 링크·코드를 알아도 Bearer 인증 전에는 초대 확인·신청·수락 서비스에 도달하지 않습니다. */
	@Test
	void residentInvitationEndpointsRejectAnonymousEvenWithCode() throws Exception {
		for (String path : List.of("/api/resident-invitations/preview", "/api/resident-invitations/shared-options",
		    "/api/resident-invitations/accept")) {
			mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON)
			    .content("{\"token\":\"R-ABCD-EFGH-JKLM\",\"correction\":false}")).andExpect(status().isUnauthorized())
			    .andExpect(jsonPath("code").value("AUTHENTICATION_REQUIRED"));
		}
		Mockito.verifyNoInteractions(residentInvitations, residentJoinCodes);
	}

	@Test
	void unlinkedResidentsUsesAuthenticatedAccountAndReturnsNoStoreWithoutPrivatePhoneData() throws Exception {
		var actor = UUID.randomUUID();
		var property = UUID.randomUUID();
		var resident = UUID.randomUUID();
		String path = "/api/properties/" + property + "/membership-requests/unlinked-residents";
		var pair = auth.startSession(actor.toString(), ClientType.WEB);
		when(membershipRequests.unlinkedResidents(actor, property))
		    .thenReturn(new SignupRequests.UnlinkedResidents(property,
		        List.of(new SignupRequests.UnlinkedResident(resident, "미연결 주민",
		            "1234", null, "101", "TENANT"))));
		mvc.perform(get(path)).andExpect(status().isUnauthorized());
		mvc.perform(get(path).header("Authorization", "Bearer " + pair.accessToken())).andExpect(status().isOk())
		    .andExpect(header().string("Cache-Control", "no-store"))
		    .andExpect(jsonPath("residents[0].phoneLast4").value("1234"))
		    .andExpect(jsonPath("residents[0].userId").doesNotExist())
		    .andExpect(jsonPath("residents[0].phoneEncrypted").doesNotExist());
		verify(membershipRequests).unlinkedResidents(actor, property);
	}

	@Test
	void chiefResidentLinkUsesAuthenticatedAccountAndRejectsMissingOrInjectedIdentity() throws Exception {
		var actor = UUID.randomUUID();
		var property = UUID.randomUUID();
		var resident = UUID.randomUUID();
		var unit = UUID.randomUUID();
		String path = "/api/properties/" + property + "/members/me/resident";
		var pair = auth.startSession(actor.toString(), ClientType.WEB);
		String body = "{\"residentId\":\"" + resident + "\",\"expectedUnitId\":\"" + unit + "\"}";
		mvc.perform(put(path).contentType(MediaType.APPLICATION_JSON).content(body))
		    .andExpect(status().isUnauthorized());
		mvc.perform(put(path).header("Authorization", "Bearer " + pair.accessToken())
		    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isNoContent())
		    .andExpect(header().string("Cache-Control", "no-store"));
		verify(memberManagement).linkOwnResident(actor, property, resident, unit);
		for (String invalid : List.of("{}", "{\"residentId\":\"" + resident + "\"}",
		    body.substring(0, body.length() - 1) + ",\"userId\":\"" + UUID.randomUUID() + "\"}")) {
			mvc.perform(put(path).header("Authorization", "Bearer " + pair.accessToken())
			    .contentType(MediaType.APPLICATION_JSON).content(invalid)).andExpect(status().isBadRequest())
			    .andExpect(jsonPath("code").value("INVALID_REQUEST"));
		}
		verifyNoMoreInteractions(memberManagement);
	}

	@Test
	void doesNotExposeDocumentationWhenDisabledOutsideLocalProfile() throws Exception {
		mvc.perform(options("/api/users/me").header("Origin", "http://localhost:4000")
		    .header("Access-Control-Request-Method", "GET")).andExpect(status().isForbidden())
		    .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
		for (String path : List.of("/swagger-ui.html", "/swagger-ui/index.html", "/v3/api-docs",
		    "/v3/api-docs/swagger-config", "/v3/api-docs.yaml")) {
			mvc.perform(get(path)).andExpect(status().isUnauthorized())
			    .andExpect(jsonPath("code").value("AUTHENTICATION_REQUIRED"));
		}
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.WEB);
		for (String path : List.of("/swagger-ui.html", "/swagger-ui/index.html", "/v3/api-docs",
		    "/v3/api-docs/swagger-config", "/v3/api-docs.yaml")) {
			mvc.perform(get(path).header("Authorization", "Bearer " + pair.accessToken()))
			    .andExpect(status().isNotFound());
		}
	}

	@Test
	void requiresBearerForBusinessEndpointsAndDoesNotOpenUnknownAuthPaths() throws Exception {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.WEB);
		mvc.perform(get("/api/test/identity")).andExpect(status().isUnauthorized())
		    .andExpect(jsonPath("code").value("AUTHENTICATION_REQUIRED"));
		mvc.perform(get("/api/test/identity").cookie(refreshCookie(pair))).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/auth/unknown")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/test/identity").header("Authorization", "Bearer " + pair.accessToken()))
		    .andExpect(status().isOk()).andExpect(jsonPath("userId").value("00000000-0000-0000-0000-000000000001"));
		mvc.perform(post("/api/test/action").header("Authorization", "Bearer " + pair.accessToken()))
		    .andExpect(status().isOk());
	}

	@Test
	void registrationEndpointsRequireBearerAndAcceptBusinessPostWithoutCsrf() throws Exception {
		UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
		UUID requestId = UUID.randomUUID();
		var pair = auth.startSession(userId.toString(), ClientType.WEB);
		for (String path : List.of("/api/property-registrations/basic-info/validate", "/api/property-registrations")) {
			mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content("{}"))
			    .andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("AUTHENTICATION_REQUIRED"))
			    .andExpect(header().string("Cache-Control", "no-store"));
			mvc.perform(post(path).cookie(refreshCookie(pair)).contentType(MediaType.APPLICATION_JSON).content("{}"))
			    .andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("AUTHENTICATION_REQUIRED"));
		}
		mvc.perform(get("/api/property-registrations/" + requestId).cookie(refreshCookie(pair)))
		    .andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("AUTHENTICATION_REQUIRED"));
		var basic = new BasicInfoRequest("모아빌라", "주소", null, null, false);
		when(registrations.validateBasicInfo(userId, basic)).thenReturn(basic);
		mvc.perform(post("/api/property-registrations/basic-info/validate")
		    .header("Authorization", "Bearer " + pair.accessToken()).contentType(MediaType.APPLICATION_JSON)
		    .content(mapper.writeValueAsString(basic))).andExpect(status().isOk())
		    .andExpect(jsonPath("hasBuildings").value(false)).andExpect(header().string("Cache-Control", "no-store"));
		verify(registrations).validateBasicInfo(userId, basic);
		Mockito.doThrow(new AuthException(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE)).when(sessions)
		    .find(anyString());
		mvc.perform(post("/api/property-registrations/basic-info/validate")
		    .header("Authorization", "Bearer " + pair.accessToken()).contentType(MediaType.APPLICATION_JSON)
		    .content(mapper.writeValueAsString(basic))).andExpect(status().isServiceUnavailable())
		    .andExpect(jsonPath("code").value("AUTH_SERVICE_UNAVAILABLE"));
	}

	@Test
	void currentUserRequiresBearerAndUsesAuthenticatedIdentityInsteadOfRequestInput() throws Exception {
		UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
		var pair = auth.startSession(userId.toString(), ClientType.WEB);
		when(users.getCurrentUser(userId))
		    .thenReturn(new CurrentUserResponse(userId, "모아 주민", null, SystemRole.USER, UserStatus.ACTIVE));

		mvc.perform(get("/api/users/me")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/users/me").cookie(refreshCookie(pair))).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/users/me").param("userId", UUID.randomUUID().toString()).header("Authorization",
		    "Bearer " + pair.accessToken())).andExpect(status().isOk())
		    .andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("id").value(userId.toString()))
		    .andExpect(jsonPath("displayName").value("모아 주민"))
		    .andExpect(jsonPath("profileImageUrl").value(Matchers.nullValue()))
		    .andExpect(jsonPath("systemRole").value("USER")).andExpect(jsonPath("status").value("ACTIVE"))
		    .andExpect(jsonPath("$.length()").value(6));
		verify(users).getCurrentUser(userId);
	}

	@Test
	void profileWriteRequiresBearerAndPreservesAuthenticatedIdentity() throws Exception {
		UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
		var pair = auth.startSession(userId.toString(), ClientType.WEB);
		when(users.updateDisplayName(userId, "새 이름"))
		    .thenReturn(new CurrentUserResponse(userId, "새 이름", null, SystemRole.USER, UserStatus.ACTIVE));
		String body = "{\"displayName\":\"새 이름\"}";
		mvc.perform(patch("/api/users/me").contentType(MediaType.APPLICATION_JSON).content(body))
		    .andExpect(status().isUnauthorized());
		mvc.perform(patch("/api/users/me").cookie(refreshCookie(pair))
		    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized());
		mvc.perform(patch("/api/users/me").header("Authorization", "Bearer " + pair.accessToken())
		    .param("userId", UUID.randomUUID().toString()).contentType(MediaType.APPLICATION_JSON).content(body))
		    .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
		    .andExpect(jsonPath("id").value(userId.toString())).andExpect(jsonPath("displayName").value("새 이름"));
		verify(users).updateDisplayName(userId, "새 이름");
	}

	@Test
	void withdrawalRequiresExplicitConfirmationAndUsesOnlyBearerIdentity() throws Exception {
		UUID id = UUID.fromString("00000000-0000-0000-0000-000000000001");
		var pair = auth.startSession(id.toString(), ClientType.WEB);
		mvc.perform(post("/api/users/me/withdrawal").cookie(refreshCookie(pair))
		    .contentType(MediaType.APPLICATION_JSON).content("{\"confirmed\":true}"))
		    .andExpect(status().isUnauthorized());
		mvc.perform(post("/api/users/me/withdrawal").header("Authorization", "Bearer " + pair.accessToken())
		    .contentType(MediaType.APPLICATION_JSON).content("{\"confirmed\":false}"))
		    .andExpect(status().isBadRequest());
		Mockito.verifyNoInteractions(accountLifecycle);
		when(accountLifecycle.status(id)).thenReturn(new WithdrawalStatus(id, true, List.of()));
		mvc.perform(get("/api/users/me/withdrawal").header("Authorization", "Bearer " + pair.accessToken()))
		    .andExpect(status().isOk()).andExpect(jsonPath("userId").value(id.toString()));
		OffsetDateTime at = OffsetDateTime.now(clock);
		when(accountLifecycle.request(id)).thenReturn(new WithdrawalReceipt(at, at.plusDays(30)));
		mvc.perform(post("/api/users/me/withdrawal").header("Authorization", "Bearer " + pair.accessToken())
		    .contentType(MediaType.APPLICATION_JSON).content("{\"confirmed\":true,\"userId\":\"another-account\"}"))
		    .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
		    .andExpect(header().string("Set-Cookie", containsString("Max-Age=0")));
		verify(accountLifecycle).request(id);
	}

	@Test
	void recoveryOnlyCookieRequiresOriginAndCsrfAndOldDeviceTokensStayInvalidAfterRecovery() throws Exception {
		UUID id = UUID.fromString("00000000-0000-0000-0000-000000000001");
		AtomicLong version = new AtomicLong(0);
		when(users.authenticationVersion(id)).thenAnswer(invocation -> version.get());
		doAnswer(invocation -> {
			if (invocation.<Long>getArgument(1) != version.get()) throw new AuthException(AuthErrorCode.SESSION_EXPIRED);
			return null;
		}).when(users).verifyAuthenticationVersion(Mockito.eq(id), anyLong());
		var oldWeb = auth.startSession(id.toString(), ClientType.WEB);
		var oldApp = auth.startSession(id.toString(), ClientType.APP);
		version.set(1);
		for (String access : List.of(oldWeb.accessToken(), oldApp.accessToken())) {
			mvc.perform(get("/api/test/identity").header("Authorization", "Bearer " + access)).andExpect(status().isUnauthorized());
		}
		mvc.perform(appRequest(AppAuthController.REFRESH_PATH, oldApp.refreshToken())).andExpect(status().isUnauthorized());
		when(users.requiresAccountRecovery(id)).thenReturn(true);
		when(users.recoveryAuthenticationVersion(id)).thenReturn(1L);
		var recovery = auth.startWebLoginSession(id);
		assertThat(recovery.recoveryRequired()).isTrue();
		assertThat(recovery.tokens().refreshExpiresAt()).isEqualTo(clock.instant().plus(Duration.ofMinutes(10)));
		String csrf = csrfToken(recovery.tokens());
		OffsetDateTime at = OffsetDateTime.now(clock);
		when(accountLifecycle.recovery(id, csrf)).thenReturn(new AccountRecoveryResponse("PENDING", "복구 계정", at,
		    at.plusDays(30), csrf));
		mvc.perform(get(WebAuthSupport.RECOVERY_PATH).cookie(refreshCookie(recovery.tokens())).header("Origin", ORIGIN))
		    .andExpect(status().isOk()).andExpect(jsonPath("state").value("PENDING"));
		mvc.perform(get("/api/test/identity").header("Authorization", "Bearer " + recovery.tokens().accessToken()))
		    .andExpect(status().isForbidden()).andExpect(jsonPath("code").value("ACCOUNT_RECOVERY_REQUIRED"));
		mvc.perform(post(WebAuthSupport.REFRESH_PATH).cookie(refreshCookie(recovery.tokens())).header("Origin", ORIGIN)
		    .header("X-CSRF-TOKEN", csrf)).andExpect(status().isForbidden());
		mvc.perform(post(WebAuthSupport.RECOVERY_PATH).cookie(refreshCookie(recovery.tokens())).header("Origin", ORIGIN))
		    .andExpect(status().isForbidden());
		mvc.perform(post(WebAuthSupport.RECOVERY_PATH).cookie(refreshCookie(recovery.tokens()))
		    .header("Origin", "https://untrusted.example.test").header("X-CSRF-TOKEN", csrf)).andExpect(status().isForbidden());
		var restored = mvc.perform(post(WebAuthSupport.RECOVERY_PATH).cookie(refreshCookie(recovery.tokens()))
		    .header("Origin", ORIGIN).header("X-CSRF-TOKEN", csrf)).andExpect(status().isNoContent()).andReturn();
		verify(accountLifecycle).recover(id);
		String cookieValue = restored.getResponse().getHeader("Set-Cookie").split(";", 2)[0]
		    .substring(WebAuthSupport.COOKIE_NAME.length() + 1);
		Cookie cookie = new Cookie(WebAuthSupport.COOKIE_NAME, cookieValue);
		String csrfBody = mvc.perform(get(WebAuthSupport.CSRF_PATH).cookie(cookie).header("Origin", ORIGIN))
		    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		String nextCsrf = mapper.readTree(csrfBody).get("csrfToken").asString();
		var rotated = mvc.perform(post(WebAuthSupport.REFRESH_PATH).cookie(cookie).header("Origin", ORIGIN)
		    .header("X-CSRF-TOKEN", nextCsrf)).andExpect(status().isOk()).andReturn().getResponse();
		String accessBody = rotated.getContentAsString();
		String access = mapper.readTree(accessBody).get("accessToken").asString();
		mvc.perform(get("/api/test/identity").header("Authorization", "Bearer " + access)).andExpect(status().isOk());
		mvc.perform(get("/api/test/identity").header("Authorization", "Bearer " + oldWeb.accessToken()))
		    .andExpect(status().isUnauthorized());
		Cookie rotatedCookie = rotated.getCookie(WebAuthSupport.COOKIE_NAME);
		mvc.perform(get(WebAuthSupport.RECOVERY_PATH).cookie(rotatedCookie).header("Origin", ORIGIN))
		    .andExpect(status().isForbidden());
	}

	@Test
	void privatePhotoReadAndRemovalRejectRefreshCookieAndUseOnlyBearerAccount() throws Exception {
		UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
		var pair = auth.startSession(userId.toString(), ClientType.WEB);
		mvc.perform(get("/api/users/me/profile-image").cookie(refreshCookie(pair)))
		    .andExpect(status().isUnauthorized());
		mvc.perform(multipart(HttpMethod.PUT, "/api/users/me/profile").cookie(refreshCookie(pair))
		    .param("displayName", "이름").param("removeImage", "true")).andExpect(status().isUnauthorized());
		Mockito.verifyNoInteractions(profileImages);
		when(profileImages.read(userId)).thenReturn(new byte[] { 1, 2 });
		mvc.perform(get("/api/users/me/profile-image").header("Authorization", "Bearer " + pair.accessToken())
		    .param("userId", UUID.randomUUID().toString()).param("v", UUID.randomUUID().toString()))
		    .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
		verify(profileImages).read(userId);
	}

	@Test
	void managementQueriesRequireBearerAndUseItsIdentityInsteadOfClientIdentity() throws Exception {
		UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
		UUID propertyId = UUID.randomUUID();
		var pair = auth.startSession(userId.toString(), ClientType.WEB);
		String list = "/api/users/me/managed-properties";
		String context = "/api/properties/" + propertyId + "/management-context";
		var property = new ManagementPropertyResponse(propertyId, "대상",
		    PropertyMemberRole.MANAGER);
		when(management.getManagedProperties(userId))
		    .thenReturn(new ManagedPropertiesResponse(List.of(property)));
		when(management.getManagementContext(userId, propertyId)).thenReturn(property);
		for (String path : List.of(list, context)) {
			mvc.perform(get(path)).andExpect(status().isUnauthorized())
			    .andExpect(jsonPath("code").value("AUTHENTICATION_REQUIRED"));
			mvc.perform(get(path).cookie(refreshCookie(pair))).andExpect(status().isUnauthorized());
			mvc.perform(get(path).header("Authorization", "Bearer " + pair.accessToken()).param("userId",
			    UUID.randomUUID().toString())).andExpect(status().isOk())
			    .andExpect(header().string("Cache-Control", "no-store"));
		}
		verify(management).getManagedProperties(userId);
		verify(management).getManagementContext(userId, propertyId);
	}

	@Test
	void propertyAccessContextChecksBearerUuidMinimalResponseAndSafeFailures() throws Exception {
		UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001"), propertyId = UUID.randomUUID();
		var pair = auth.startSession(userId.toString(), ClientType.WEB);
		String path = "/api/properties/" + propertyId + "/access-context";
		when(management.getPropertyAccessContext(userId, propertyId)).thenReturn(
		    new PropertyAccessContextResponse(propertyId, "대상",
		        PropertyMemberRole.RESIDENT, false));
		mvc.perform(get(path)).andExpect(status().isUnauthorized());
		mvc.perform(get(path).header("Authorization", "Bearer " + pair.accessToken()))
		    .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
		    .andExpect(jsonPath("$.length()").value(4)).andExpect(jsonPath("residentEligible").value(false))
		    .andExpect(jsonPath("role").value("RESIDENT"));
		mvc.perform(get("/api/properties/invalid/access-context").header("Authorization", "Bearer " + pair.accessToken()))
		    .andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("INVALID_REQUEST"));
		for (var code : List.of(AuthErrorCode.ACCESS_DENIED, AuthErrorCode.AUTH_SERVICE_UNAVAILABLE)) {
			doThrow(new AuthException(code)).when(management).getPropertyAccessContext(userId, propertyId);
			mvc.perform(get(path).header("Authorization", "Bearer " + pair.accessToken()))
			    .andExpect(status().is(code.status().value())).andExpect(header().string("Cache-Control", "no-store"))
			    .andExpect(jsonPath("code").value(code.name()));
		}
	}

	@Test
	void currentUserRejectsAccountThatBecameUnavailableAfterAuthentication() throws Exception {
		UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
		var pair = auth.startSession(userId.toString(), ClientType.WEB);
		when(users.getCurrentUser(userId)).thenThrow(new UserException(UserErrorCode.ACCOUNT_UNAVAILABLE));

		mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + pair.accessToken()))
		    .andExpect(status().isForbidden()).andExpect(header().string("Cache-Control", "no-store"))
		    .andExpect(jsonPath("code").value("ACCOUNT_UNAVAILABLE")).andExpect(jsonPath("displayName").doesNotExist());
	}

	@Test
	void currentUserStorageFailureReturnsSafeRetryableResponse() throws Exception {
		UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
		var pair = auth.startSession(userId.toString(), ClientType.WEB);
		when(users.getCurrentUser(userId)).thenThrow(new DataAccessResourceFailureException("private-database-detail"));

		mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + pair.accessToken()))
		    .andExpect(status().isServiceUnavailable()).andExpect(header().string("Cache-Control", "no-store"))
		    .andExpect(jsonPath("code").value("AUTH_SERVICE_UNAVAILABLE"))
		    .andExpect(jsonPath("message").value(not(containsString("private-database-detail"))));
	}

	@Test
	void rejectsMalformedTamperedAndRefreshBearerTokens() throws Exception {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		mvc.perform(get("/api/test/identity").header("Authorization", "Bearer invalid"))
		    .andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("INVALID_TOKEN"));
		mvc.perform(get("/api/test/identity").header("Authorization", "Bearer " + pair.refreshToken()))
		    .andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("INVALID_TOKEN"));
		mvc.perform(get("/api/test/identity").param("access_token", pair.accessToken()))
		    .andExpect(status().isUnauthorized());
	}

	@Test
	void returnsJson403ForDeniedMethod() throws Exception {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		mvc.perform(get("/api/test/denied").header("Authorization", "Bearer " + pair.accessToken()))
		    .andExpect(status().isForbidden()).andExpect(jsonPath("code").value("ACCESS_DENIED"));
	}

	@Test
	void expiredAccessCanRefreshButExpiredRefreshRequiresLogin() throws Exception {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		clock.advance(Duration.ofHours(1));
		mvc.perform(get("/api/test/identity").header("Authorization", "Bearer " + pair.accessToken()))
		    .andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("ACCESS_TOKEN_EXPIRED"));
		mvc.perform(appRequest(AppAuthController.REFRESH_PATH, pair.refreshToken()).header("Authorization",
		    "Bearer " + pair.accessToken())).andExpect(status().isOk())
		    .andExpect(jsonPath("refreshExpiresAt").value(pair.refreshExpiresAt().toString()));
		clock.set(pair.refreshExpiresAt());
		mvc.perform(appRequest(AppAuthController.REFRESH_PATH, pair.refreshToken()))
		    .andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("REFRESH_TOKEN_EXPIRED"));
	}

	@Test
	void webRefreshRequiresOriginAndCsrfHeaderAndKeepsRefreshOutOfJson() throws Exception {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.WEB);
		String csrf = csrfToken(pair);
		mvc.perform(post(WebAuthSupport.REFRESH_PATH).cookie(refreshCookie(pair))).andExpect(status().isForbidden())
		    .andExpect(jsonPath("code").value("CSRF_INVALID"));
		mvc.perform(post(WebAuthSupport.REFRESH_PATH).cookie(refreshCookie(pair)).header("Origin", ORIGIN))
		    .andExpect(status().isForbidden()).andExpect(jsonPath("code").value("CSRF_INVALID"));
		mvc.perform(
		    post(WebAuthSupport.REFRESH_PATH).cookie(refreshCookie(pair)).header("Origin", ORIGIN).param("_csrf", csrf))
		    .andExpect(status().isForbidden());
		mvc.perform(post(WebAuthSupport.REFRESH_PATH).cookie(refreshCookie(pair)).header("Origin", ORIGIN)
		    .header("X-CSRF-TOKEN", csrf)).andExpect(status().isOk()).andExpect(jsonPath("accessToken").isNotEmpty())
		    .andExpect(jsonPath("refreshToken").doesNotExist()).andExpect(header().string("Cache-Control", "no-store"))
		    .andExpect(cookie().httpOnly(WebAuthSupport.COOKIE_NAME, true))
		    .andExpect(cookie().secure(WebAuthSupport.COOKIE_NAME, true))
		    .andExpect(cookie().path(WebAuthSupport.COOKIE_NAME, WebAuthSupport.COOKIE_PATH))
		    .andExpect(header().string("Set-Cookie", containsString("SameSite=Lax")))
		    .andExpect(header().string("Set-Cookie", not(containsString("Domain="))));
	}

	@Test
	void allowsOnlyConfiguredCorsOriginAndProcessesPreflightWithoutLogin() throws Exception {
		mvc.perform(options("/api/test/action").header("Origin", ORIGIN).header("Access-Control-Request-Method", "POST")
		    .header("Access-Control-Request-Headers", "Authorization")).andExpect(status().isOk())
		    .andExpect(header().string("Access-Control-Allow-Origin", ORIGIN))
		    .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
		mvc.perform(options("/api/test/action").header("Origin", "https://untrusted.example")
		    .header("Access-Control-Request-Method", "POST")).andExpect(status().isForbidden())
		    .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
	}

	@Test
	void webLogoutInvalidatesAccessImmediatelyAndPreservesOtherLogin() throws Exception {
		var webPair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.WEB);
		var appPair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		mvc.perform(post(WebAuthSupport.LOGOUT_PATH).cookie(refreshCookie(webPair)).header("Origin", ORIGIN)
		    .header("X-CSRF-TOKEN", csrfToken(webPair))).andExpect(status().isNoContent())
		    .andExpect(cookie().maxAge(WebAuthSupport.COOKIE_NAME, 0));
		mvc.perform(get("/api/test/identity").header("Authorization", "Bearer " + webPair.accessToken()))
		    .andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("SESSION_EXPIRED"));
		mvc.perform(get("/api/test/identity").header("Authorization", "Bearer " + appPair.accessToken()))
		    .andExpect(status().isOk());
		assertThat(auth.refresh(appPair.refreshToken(), ClientType.APP).refreshToken()).isNotBlank();
	}

	@Test
	void appLogoutAcceptsRefreshAfterAccessExpiresAndDoesNotUseCookie() throws Exception {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		clock.advance(Duration.ofHours(1));
		mvc.perform(post(AppAuthController.LOGOUT_PATH).cookie(refreshCookie(pair))
		    .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest())
		    .andExpect(jsonPath("code").value("INVALID_REQUEST"));
		mvc.perform(appRequest(AppAuthController.LOGOUT_PATH, pair.refreshToken())).andExpect(status().isNoContent());
		assertCode(() -> auth.refresh(pair.refreshToken(), ClientType.APP), AuthErrorCode.SESSION_EXPIRED);
	}

	@Test
	void cannotUseWebRefreshThroughAppRouteOrAppRefreshThroughWebRoute() throws Exception {
		var webPair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.WEB);
		var appPair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		mvc.perform(appRequest(AppAuthController.REFRESH_PATH, webPair.refreshToken()))
		    .andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("INVALID_TOKEN"));
		mvc.perform(get(WebAuthSupport.CSRF_PATH).cookie(refreshCookie(appPair)).header("Origin", ORIGIN))
		    .andExpect(status().isUnauthorized()).andExpect(jsonPath("code").value("INVALID_TOKEN"));
		assertThat(auth.authenticateAccess(webPair.accessToken()).userId())
		    .isEqualTo("00000000-0000-0000-0000-000000000001");
		assertThat(auth.authenticateAccess(appPair.accessToken()).userId())
		    .isEqualTo("00000000-0000-0000-0000-000000000001");
	}

	@Test
	void refreshReplayRevokesThatSessionIncludingNewTokens() {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		var other = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		var refreshed = auth.refresh(pair.refreshToken(), ClientType.APP);
		assertCode(() -> auth.refresh(pair.refreshToken(), ClientType.APP), AuthErrorCode.REFRESH_TOKEN_REUSED);
		assertCode(() -> auth.authenticateAccess(refreshed.accessToken()), AuthErrorCode.SESSION_EXPIRED);
		assertCode(() -> auth.refresh(refreshed.refreshToken(), ClientType.APP), AuthErrorCode.SESSION_EXPIRED);
		assertThat(auth.authenticateAccess(other.accessToken()).userId())
		    .isEqualTo("00000000-0000-0000-0000-000000000001");
	}

	@Test
	void redisStoresOnlyRefreshHashAndRotationDoesNotExtendTtl() {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		String sid = tokens.readAccess(pair.accessToken()).getClaimAsString("sid");
		String key = "auth:session:" + sid;
		long ttlBefore = redis.getExpire(key);
		assertThat(ttlBefore).isBetween(Duration.ofDays(14).toSeconds() - 5, Duration.ofDays(14).toSeconds());
		assertThat(redis.opsForHash().entries(key).values()).doesNotContain(pair.refreshToken());
		clock.advance(Duration.ofDays(7));
		var refreshed = auth.refresh(pair.refreshToken(), ClientType.APP);
		assertThat(refreshed.refreshExpiresAt()).isEqualTo(pair.refreshExpiresAt());
		assertThat(redis.getExpire(key)).isLessThanOrEqualTo(ttlBefore);
		assertThat(redis.opsForHash().get(key, "refreshHash")).isEqualTo(TokenService.hash(refreshed.refreshToken()));
	}

	@Test
	void concurrentRefreshDoesNotAcceptTheSameTokenTwice() throws Exception {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		CountDownLatch ready = new CountDownLatch(2);
		CountDownLatch start = new CountDownLatch(1);
		Callable<Boolean> task = () -> {
			ready.countDown();
			start.await();
			try {
				auth.refresh(pair.refreshToken(), ClientType.APP);
				return true;
			} catch (AuthException exception) {
				assertThat(exception.code()).isIn(AuthErrorCode.REFRESH_TOKEN_REUSED, AuthErrorCode.SESSION_EXPIRED);
				return false;
			}
		};
		try (var executor = Executors.newFixedThreadPool(2)) {
			var first = executor.submit(task);
			var second = executor.submit(task);
			assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
			start.countDown();
			assertThat(List.of(first.get(5, TimeUnit.SECONDS),
			    second.get(5, TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
		}
		assertCode(() -> auth.authenticateAccess(pair.accessToken()), AuthErrorCode.SESSION_EXPIRED);
	}

	@Test
	void deletedSessionCannotBeRecreatedByAnInFlightRotation() {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		var session = auth.authenticateRefresh(pair.refreshToken(), ClientType.APP);
		auth.logout(pair.refreshToken(), ClientType.APP);
		assertThat(sessions.rotate(session, TokenService.hash(pair.refreshToken()), "new-hash")).isZero();
		assertThat(sessions.find(session.sessionId())).isEmpty();
	}

	@Test
	void redisFailureReturns503InsteadOfAcceptingSignedJwt() throws Exception {
		var pair = auth.startSession("00000000-0000-0000-0000-000000000001", ClientType.APP);
		doThrow(new AuthException(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE)).when(sessions).find(anyString());
		mvc.perform(get("/api/test/identity").header("Authorization", "Bearer " + pair.accessToken()))
		    .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("code").value("AUTH_SERVICE_UNAVAILABLE"));
		mvc.perform(appRequest(AppAuthController.REFRESH_PATH, pair.refreshToken()))
		    .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("code").value("AUTH_SERVICE_UNAVAILABLE"));
	}

	@Test
	void inactiveAccountCannotUseExistingAccessOrRefreshButCanLogout() throws Exception {
		String id = "00000000-0000-0000-0000-000000000001";
		var pair = auth.startSession(id, ClientType.APP);
		Mockito.when(users.requireActive(UUID.fromString(id)))
		    .thenThrow(new UserException(UserErrorCode.ACCOUNT_UNAVAILABLE));
		mvc.perform(get("/api/test/identity").header("Authorization", "Bearer " + pair.accessToken()))
		    .andExpect(status().isForbidden()).andExpect(jsonPath("code").value("ACCOUNT_UNAVAILABLE"));
		mvc.perform(appRequest(AppAuthController.REFRESH_PATH, pair.refreshToken())).andExpect(status().isForbidden())
		    .andExpect(jsonPath("code").value("ACCOUNT_UNAVAILABLE"));
		mvc.perform(appRequest(AppAuthController.LOGOUT_PATH, pair.refreshToken())).andExpect(status().isNoContent());
	}

	private String csrfToken(TokenService.TokenPair pair) throws Exception {
		String body = mvc.perform(get(WebAuthSupport.CSRF_PATH).cookie(refreshCookie(pair)).header("Origin", ORIGIN))
		    .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn()
		    .getResponse().getContentAsString();
		return mapper.readTree(body).get("csrfToken").asString();
	}

	private Cookie refreshCookie(TokenService.TokenPair pair) {
		return new Cookie(WebAuthSupport.COOKIE_NAME, pair.refreshToken());
	}

	private MockHttpServletRequestBuilder appRequest(String path, String refreshToken) throws Exception {
		return post(path).contentType(MediaType.APPLICATION_JSON)
		    .content(mapper.writeValueAsString(Map.of("refreshToken", refreshToken)));
	}

	private void assertCode(Runnable action, AuthErrorCode code) {
		assertThatThrownBy(action::run).isInstanceOfSatisfying(AuthException.class,
		    exception -> assertThat(exception.code()).isEqualTo(code));
	}

	@TestConfiguration
	static class TestBeans {
		@Bean
		@Primary
		MutableClock testClock() {
			return new MutableClock(Instant.now());
		}
	}

	@RestController
	static class ProbeController {
		@GetMapping("/api/test/identity")
		AuthPrincipal identity(@AuthenticationPrincipal AuthPrincipal principal) {
			return principal;
		}

		@PostMapping("/api/test/action")
		Map<String, String> action() {
			return Map.of("result", "ok");
		}

		@GetMapping("/api/test/denied")
		@PreAuthorize("denyAll()")
		void denied() {
		}
	}
}
