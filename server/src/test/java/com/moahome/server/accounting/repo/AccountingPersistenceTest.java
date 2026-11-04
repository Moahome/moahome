package com.moahome.server.accounting.repo;

import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import com.moahome.server.user.support.PostgresTestServer;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AccountingPersistenceTest {
	@Test
	void upgradesRealPostgresAndPreservesSourcesWhileEnforcingScopeVersionsAndAppendOnlyHistory() {
		try (PostgresTestServer postgres = new PostgresTestServer()) {
			var dataSource = new DriverManagerDataSource(postgres.jdbcUrl(), postgres.username(), "");
			var jdbc = new JdbcTemplate(dataSource);
			Flyway.configure().dataSource(dataSource).target("20261103092736").load().migrate();
			UUID user = UUID.randomUUID(), property = UUID.randomUUID(), bank = UUID.randomUUID();
			UUID expense = UUID.randomUUID(), account = UUID.randomUUID(), revenue = UUID.randomUUID();
			UUID template = UUID.randomUUID(), item = UUID.randomUUID();
			jdbc.update("insert into users(id,display_name,status) values (?, '테스트', 'ACTIVE')", user);
			jdbc.update("insert into properties(id,name,address,has_buildings,status,created_at,updated_at) values (?, '관리대상', '테스트 주소', false, 'ACTIVE', now(),now())", property);
			jdbc.update("insert into bank_accounts(id,property_id,holder_name_snapshot,bank_code,bank_name,account_number_encrypted,account_number_hmac,account_last4,is_primary,valid_from,status,created_at,updated_at,registration_order) values (?,?, '테스트', '081','은행','cipher',?,'1234',true,'2026-01-01','ACTIVE',now(),now(),0)", bank, property, "a".repeat(64));
			jdbc.update("insert into expenses(id,property_id,source_type,bank_account_id,expense_date,category_encrypted,total_amount,allocation_mode,save_as_rule,confirmed_by,confirmed_at) values (?,?,'MANUAL',?,'2026-09-01','cipher',100,'PROPERTY',false,?,now())", expense, property, bank, user);
			jdbc.update("insert into fee_templates(id,property_id,name,is_default,effective_from,status,created_at,updated_at) values (?,?,'기본',true,'2026-01-01','ACTIVE',now(),now())", template, property);
			jdbc.update("insert into fee_template_items(id,fee_template_id,property_id,item_code,item_name,default_amount,sort_order,is_active,created_at,updated_at) values (?,?,?,'GENERAL_MANAGEMENT','관리비',100,0,true,now(),now())", item, template, property);
			Flyway upgraded = Flyway.configure().dataSource(dataSource).load();
			assertThat(upgraded.migrate().migrationsExecuted).isEqualTo(3);
			upgraded.validate();
			assertThat(jdbc.queryForObject("select total_amount from expenses where id=?", Integer.class, expense)).isEqualTo(100);
			jdbc.update("insert into accounting_profiles values (?,'2026-10-01',1,?,now())", property, user);
			jdbc.update("insert into accounting_accounts values (?,?,'비용','OPERATING_EXPENSE',null,?,now())", account, property, user);
			jdbc.update("insert into accounting_accounts values (?,?,'관리비수익','OPERATING_REVENUE','MANAGEMENT_REVENUE',?,now())", revenue, property, user);
			// 시작 월 전 귀속 사실 확인은 가능하지만 기간 손익 반영은 조회 시작 기준에서 별도로 제한합니다.
			jdbc.update("insert into expense_accounting_reviews values (?,?,?,?,'2026-09-01',1,'cipher',?,now())", UUID.randomUUID(), property, expense, account, user);
			assertThatThrownBy(() -> jdbc.update("update expense_accounting_reviews set recognition_month='2026-10-01'"))
				.isInstanceOf(DataIntegrityViolationException.class);
			assertThatThrownBy(() -> jdbc.update("insert into expense_accounting_reviews values (?,?,?,?,'2026-10-01',3,'cipher',?,now())", UUID.randomUUID(), property, expense, account, user))
				.isInstanceOf(DataIntegrityViolationException.class);
			assertThatThrownBy(() -> jdbc.update("insert into expense_accounting_reviews values (?,?,?,?,'2026-10-01',2,'cipher',?,now())", UUID.randomUUID(), property, expense, revenue, user))
				.isInstanceOf(DataIntegrityViolationException.class);
			jdbc.update("insert into expense_accounting_reviews values (?,?,?,?,'2026-10-01',2,'cipher',?,now())", UUID.randomUUID(), property, expense, account, user);
			jdbc.update("insert into revenue_accounting_reviews values (?,?,?,true,1,'cipher',?,now())", UUID.randomUUID(), property, item, user);
			assertThatThrownBy(() -> jdbc.update("delete from revenue_accounting_reviews"))
				.isInstanceOf(DataIntegrityViolationException.class);
			assertThat(jdbc.queryForObject("select count(*) from expense_accounting_reviews", Integer.class)).isEqualTo(2);
			assertThat(upgraded.migrate().migrationsExecuted).isZero();
		}
	}
}
