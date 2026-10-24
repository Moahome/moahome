package com.moahome.server;

import java.security.SecureRandom;
import java.util.Base64;

import com.moahome.server.user.repo.UserRepository;
import com.moahome.server.auth.repo.SocialAccountRepository;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(properties = "moahome.billing.scheduler-enabled=false")
@ActiveProfiles("test")
class ServerApplicationTests {
	@MockitoBean
	private com.moahome.server.membership.service.ResidentInvitationService residentInvitations;

	@MockitoBean
	private com.moahome.server.membership.service.ResidentJoinCodeService residentJoinCodes;

	@MockitoBean
	private com.moahome.server.payment.service.PaymentService payments;

	@MockitoBean
	private com.moahome.server.banking.service.BankingService banking;

	@MockitoBean
	private com.moahome.server.banking.service.IncomeAllocationService incomeAllocations;

	@MockitoBean
	private com.moahome.server.banking.service.BankingBalanceService bankingBalances;

	@MockitoBean
	private com.moahome.server.banking.service.BankBalanceCheckService bankBalanceChecks;

	@MockitoBean
	private com.moahome.server.banking.service.BankAccountService bankAccountSettings;

	@MockitoBean
	private com.moahome.server.expense.service.ExpenseService expenses;

	@MockitoBean
	private com.moahome.server.payment.service.CumulativePaymentService cumulativePayments;

	@MockitoBean
	private com.moahome.server.billing.service.BillingService billing;

	@MockitoBean
	private com.moahome.server.billing.service.OpeningBalanceService openingBalances;

	@MockitoBean
	private com.moahome.server.membership.service.MemberManagementService memberManagement;

	@MockitoBean
	private com.moahome.server.membership.service.MembershipRequestService membershipRequests;

	@MockitoBean
	private com.moahome.server.billing.service.BillingTemplates billingTemplates;

	@MockitoBean
	private com.moahome.server.billing.service.BillingGenerationService billingGeneration;

	@MockitoBean
	private com.moahome.server.property.service.ManagementAccessService management;

	@MockitoBean
	private com.moahome.server.property.service.UnitManagementService unitManagement;

	@MockitoBean
	private com.moahome.server.resident.service.ResidentListService residentList;

	@MockitoBean
	private com.moahome.server.resident.service.ResidentRegistrationService residentRegistration;

	@MockitoBean
	private com.moahome.server.resident.service.ResidentImportService residentImport;

	@MockitoBean
	private com.moahome.server.resident.service.ResidentManagementService residentManagement;

	@MockitoBean
	private com.moahome.server.resident.service.ResidentExportService residentExport;

	@MockitoBean
	private UserRepository users;

	@MockitoBean
	private SocialAccountRepository socialAccounts;

	@MockitoBean
	private com.moahome.server.property.service.PropertyRegistrationService registrations;

	@MockitoBean
	private com.moahome.server.property.repo.PropertyRegistrationLock registrationLock;

	@DynamicPropertySource
	static void securityProperties(DynamicPropertyRegistry registry) {
		com.moahome.server.property.support.RegistrationTestKeys.register(registry);
		byte[] accessKey = new byte[64];
		byte[] refreshKey = new byte[64];
		SecureRandom random = new SecureRandom();
		random.nextBytes(accessKey);
		random.nextBytes(refreshKey);
		String accessSecret = Base64.getEncoder().encodeToString(accessKey);
		String refreshSecret = Base64.getEncoder().encodeToString(refreshKey);
		registry.add("moahome.security.jwt-access-secret-base64", () -> accessSecret);
		registry.add("moahome.security.jwt-refresh-secret-base64", () -> refreshSecret);
	}

	@Test
	void contextLoads() {
	}

}
