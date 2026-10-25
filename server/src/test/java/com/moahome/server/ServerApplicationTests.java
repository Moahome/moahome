package com.moahome.server;

import java.security.SecureRandom;
import java.util.Base64;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.moahome.server.auth.repo.SocialAccountRepository;
import com.moahome.server.banking.service.BankAccountService;
import com.moahome.server.banking.service.BankBalanceCheckService;
import com.moahome.server.banking.service.BankingBalanceService;
import com.moahome.server.banking.service.BankingService;
import com.moahome.server.banking.service.IncomeAllocationService;
import com.moahome.server.billing.service.BillingGenerationService;
import com.moahome.server.billing.service.BillingService;
import com.moahome.server.billing.service.BillingTemplates;
import com.moahome.server.billing.service.OpeningBalanceService;
import com.moahome.server.expense.service.ExpenseService;
import com.moahome.server.membership.service.MemberManagementService;
import com.moahome.server.membership.service.MembershipRequestService;
import com.moahome.server.membership.service.ResidentInvitationService;
import com.moahome.server.membership.service.ResidentJoinCodeService;
import com.moahome.server.payment.service.CumulativePaymentService;
import com.moahome.server.payment.service.PayerMatchService;
import com.moahome.server.payment.service.PaymentService;
import com.moahome.server.property.repo.PropertyRegistrationLock;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.property.service.PropertyRegistrationService;
import com.moahome.server.property.service.UnitManagementService;
import com.moahome.server.property.support.RegistrationTestKeys;
import com.moahome.server.resident.service.ResidentExportService;
import com.moahome.server.resident.service.ResidentImportService;
import com.moahome.server.resident.service.ResidentListService;
import com.moahome.server.resident.service.ResidentManagementService;
import com.moahome.server.resident.service.ResidentRegistrationService;
import com.moahome.server.user.repo.UserRepository;

@SpringBootTest(properties = "moahome.billing.scheduler-enabled=false")
@ActiveProfiles("test")
class ServerApplicationTests {
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
	private CumulativePaymentService cumulativePayments;

	@MockitoBean
	private BillingService billing;

	@MockitoBean
	private OpeningBalanceService openingBalances;

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
	private ResidentManagementService residentManagement;

	@MockitoBean
	private ResidentExportService residentExport;

	@MockitoBean
	private UserRepository users;

	@MockitoBean
	private SocialAccountRepository socialAccounts;

	@MockitoBean
	private PropertyRegistrationService registrations;

	@MockitoBean
	private PropertyRegistrationLock registrationLock;

	@DynamicPropertySource
	static void securityProperties(DynamicPropertyRegistry registry) {
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
	}

	@Test
	void contextLoads() {
	}

}
