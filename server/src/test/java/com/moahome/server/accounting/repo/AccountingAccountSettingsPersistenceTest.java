package com.moahome.server.accounting.repo;

import java.util.UUID;
import java.util.Map;
import java.util.Optional;
import java.util.List;
import java.time.Clock;
import jakarta.persistence.EntityManager;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import com.moahome.server.user.support.PostgresTestServer;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.SharedEntityManagerCreator;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.transaction.support.TransactionTemplate;
import com.moahome.server.accounting.service.AccountingAccountSettingsService;
import com.moahome.server.accounting.dto.AccountingRequests;
import com.moahome.server.accounting.dto.AccountingAccountSettings;
import com.moahome.server.common.security.PaymentTextSecurity;
import com.moahome.server.expense.repo.ExpenseRepository;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.domain.Property;
import com.moahome.server.property.dto.ManagementPropertyResponse;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.property.service.ManagementAccessService;
import tools.jackson.databind.json.JsonMapper;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AccountingAccountSettingsPersistenceTest {
	@Test
	void upgradesExistingAccountsAndProtectsUsageHistoryAndInactiveSelections() {
		try (PostgresTestServer postgres = new PostgresTestServer()) {
			var source = new DriverManagerDataSource(postgres.jdbcUrl(), postgres.username(), "");
			var jdbc = new JdbcTemplate(source);
			Flyway.configure().dataSource(source).target("20261107082855").load().migrate();
			UUID actor = UUID.randomUUID(), property = UUID.randomUUID(), bank = UUID.randomUUID();
			UUID basic = UUID.randomUUID(), used = UUID.randomUUID(), unused = UUID.randomUUID(), required = UUID.randomUUID();
			UUID expense = UUID.randomUUID();
			jdbc.update("insert into users(id,display_name,status) values (?,'테스트','ACTIVE')", actor);
			jdbc.update("insert into properties(id,name,address,has_buildings,status,created_at,updated_at) values (?,'관리대상','주소',false,'ACTIVE',now(),now())", property);
			jdbc.update("insert into bank_accounts(id,property_id,holder_name_snapshot,bank_code,bank_name,account_number_encrypted,account_number_hmac,account_last4,is_primary,valid_from,status,created_at,updated_at,registration_order) values (?,?,'테스트','081','은행','cipher',?,'1234',true,'2026-01-01','ACTIVE',now(),now(),0)", bank, property, "a".repeat(64));
			for (Object[] row : new Object[][] {{basic, "802", "청소비", "OPERATING_EXPENSE", null}, {used, "814", "점검비", "OPERATING_EXPENSE", null}, {unused, "815", "미사용", "OPERATING_EXPENSE", null}, {required, "101", "통장", "ASSET", "BANK"}})
				jdbc.update("insert into accounting_accounts(id,property_id,code,name,report_group,system_key,created_by,created_at) values (?,?,?,?,?,?,?,now())", row[0], property, row[1], row[2], row[3], row[4], actor);
			jdbc.update("insert into expenses(id,property_id,source_type,bank_account_id,expense_date,category_encrypted,total_amount,allocation_mode,save_as_rule,confirmed_by,confirmed_at,accounting_account_id) values (?,?,'MANUAL',?,'2026-11-01','cipher',100,'PROPERTY',false,?,now(),?)", expense, property, bank, actor, used);
			Flyway current = Flyway.configure().dataSource(source).load();
			current.migrate();
			current.validate();
			assertThat(jdbc.queryForObject("select default_account from accounting_accounts where id=?", Boolean.class, basic)).isTrue();
			assertThatThrownBy(() -> jdbc.update("update accounting_accounts set name='변경',revision=revision+1,changed_at=now(),changed_by=? where id=?", actor, basic)).isInstanceOf(DataIntegrityViolationException.class);
			assertThatThrownBy(() -> jdbc.update("update accounting_accounts set active=false,revision=revision+1,changed_at=now(),changed_by=? where id=?", actor, required)).isInstanceOf(DataIntegrityViolationException.class);
			jdbc.update("update accounting_accounts set name='새 점검비',revision=revision+1,changed_at=now(),changed_by=? where id=?", actor, used);
			assertThatThrownBy(() -> jdbc.update("update accounting_accounts set code='816',revision=revision+1,changed_at=now(),changed_by=? where id=?", actor, used)).isInstanceOf(DataIntegrityViolationException.class);
			assertThatThrownBy(() -> jdbc.update("update accounting_accounts set active=false,deleted_at=now(),revision=revision+1,changed_at=now(),changed_by=? where id=?", actor, used)).isInstanceOf(DataIntegrityViolationException.class);
			jdbc.update("update accounting_accounts set active=false,revision=revision+1,changed_at=now(),changed_by=? where id=?", actor, basic);
			assertThatThrownBy(() -> jdbc.update("insert into expenses(id,property_id,source_type,bank_account_id,expense_date,category_encrypted,total_amount,allocation_mode,save_as_rule,confirmed_by,confirmed_at,accounting_account_id) values (?,?,'MANUAL',?,'2026-11-02','cipher',100,'PROPERTY',false,?,now(),?)", UUID.randomUUID(), property, bank, actor, basic)).isInstanceOf(DataIntegrityViolationException.class);
			jdbc.update("update accounting_accounts set code='104',report_group='ASSET',revision=revision+1,changed_at=now(),changed_by=? where id=?", actor, unused);
			jdbc.update("update accounting_accounts set active=false,deleted_at=now(),revision=revision+1,changed_at=now(),changed_by=? where id=?", actor, unused);
			assertThat(jdbc.queryForObject("select count(*) from accounting_account_changes where account_id=?", Integer.class, unused)).isEqualTo(3);
			assertThatThrownBy(() -> jdbc.update("update accounting_account_changes set name='변경' where account_id=?", used)).isInstanceOf(DataIntegrityViolationException.class);
			assertThatThrownBy(() -> jdbc.update("delete from accounting_accounts where id=?", unused)).isInstanceOf(DataIntegrityViolationException.class);
			assertThat(jdbc.queryForObject("select accounting_account_id from expenses where id=?", UUID.class, expense)).isEqualTo(used);
			assertThat(jdbc.queryForObject("select total_amount from expenses where id=?", Integer.class, expense)).isEqualTo(100);
			// 실제 JPA 쿼리·프로젝션·Entity 변경과 응답 직렬화까지 확인해 모의 화면과 실제 API의 차이를 검증합니다.
			var factory = new LocalContainerEntityManagerFactoryBean();
			factory.setDataSource(source);
			factory.setPackagesToScan("com.moahome.server.accounting.domain", "com.moahome.server.expense.domain");
			factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
			factory.setJpaPropertyMap(Map.of("hibernate.hbm2ddl.auto", "validate",
				"hibernate.physical_naming_strategy", "org.hibernate.boot.model.naming.PhysicalNamingStrategySnakeCaseImpl"));
			factory.afterPropertiesSet();
			try {
				EntityManager entityManager = SharedEntityManagerCreator.createSharedEntityManager(factory.getObject());
				var repositories = new JpaRepositoryFactory(entityManager);
				AccountingAccountRepository accountRepository = repositories.getRepository(AccountingAccountRepository.class);
				ExpenseRepository expenseRepository = repositories.getRepository(ExpenseRepository.class);
				ManagementAccessService access = mock(ManagementAccessService.class);
				PropertyRepository properties = mock(PropertyRepository.class);
				when(access.getManagementContext(actor, property)).thenReturn(new ManagementPropertyResponse(property, "관리대상", PropertyMemberRole.ADMIN));
				when(properties.findForUnitUpdate(property)).thenReturn(Optional.of(mock(Property.class)));
				var service = new AccountingAccountSettingsService(access, properties, accountRepository, expenseRepository,
					mock(PaymentTextSecurity.class), Clock.systemUTC());
				var transaction = new TransactionTemplate(new JpaTransactionManager(factory.getObject()));
				var workspace = transaction.execute(status -> service.get(actor, property));
				assertThat(workspace.accounts()).anyMatch(value -> value.id().equals(used) && value.used() && value.name().equals("새 점검비"));
				String json = JsonMapper.builder().build().writeValueAsString(workspace);
				assertThat(json).contains("\"canManage\":true", "\"defaultAccount\":true", "\"group\":\"ASSET\"");
				transaction.executeWithoutResult(status -> service.status(actor, property, basic, new AccountingRequests.AccountStatus(true, 1)));
				assertThat(jdbc.queryForObject("select active from accounting_accounts where id=?", Boolean.class, basic)).isTrue();
				List<AccountingAccountSettings.Change> history = transaction.execute(status -> service.history(actor, property, basic));
				assertThat(history).hasSize(3);
			} finally {
				factory.destroy();
			}
		}
	}
}
