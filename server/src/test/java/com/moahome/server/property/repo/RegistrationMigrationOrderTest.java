package com.moahome.server.property.repo;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.exception.FlywayValidateException;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import com.moahome.server.user.support.PostgresTestServer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 운영 DB를 사용하지 않고 11월 1일 버전 뒤에 도착한 10월 31일 Migration을 재현합니다. */
class RegistrationMigrationOrderTest {
	private static final PostgresTestServer POSTGRES = new PostgresTestServer();
	private static final Set<String> LATE_VERSIONS = Set.of("20261031065016", "20261031071757", "20261031073149");
	private static final String DEPLOYED_VERSION = "20261101063843";
	@TempDir
	Path temporary;

	@AfterAll
	static void stopPostgres() {
		POSTGRES.close();
	}

	/** 누락 3개만 순서 외 적용하고, 이후 기본 설정으로 재검증하며 기존 행·체크섬을 보존합니다. */
	@Test
	void lateRegistrationMigrationsApplyOnceAndValidateWithNormalOrderingAgain() throws Exception {
		Path baseline = Files.createDirectory(temporary.resolve("deployed"));
		try (var paths = Files.list(Path.of("src/main/resources/db/migration"))) {
			for (Path path : paths.filter(file -> file.toString().endsWith(".sql")).toList()) {
				String version = path.getFileName().toString().substring(1, 15);
				if (!LATE_VERSIONS.contains(version))
					Files.copy(path, baseline.resolve(path.getFileName()));
			}
		}
		String schema = "late_registration_" + UUID.randomUUID().toString().replace("-", "");
		Flyway deployed = flyway(schema, "filesystem:" + baseline, false);
		deployed.migrate();
		JdbcTemplate jdbc = new JdbcTemplate(new DriverManagerDataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), ""));
		UUID user = UUID.randomUUID();
		UUID property = UUID.randomUUID();
		jdbc.update("insert into " + schema + ".users(id,display_name,status,system_role) values (?, '회귀 검사', 'ACTIVE', 'USER')", user);
		jdbc.update("insert into " + schema + ".properties(id,name,address,has_buildings,status,created_at,updated_at) "
		    + "values (?, '회귀 검사 관리대상', '테스트 주소', false, 'ACTIVE', now(), now())", property);
		List<Map<String, Object>> users = jdbc.queryForList("select * from " + schema + ".users order by id");
		List<Map<String, Object>> properties = jdbc.queryForList("select * from " + schema + ".properties order by id");
		List<Map<String, Object>> checksums = jdbc.queryForList("select version,checksum from " + schema
		    + ".flyway_schema_history where version is not null order by version");

		Flyway normal = flyway(schema, "classpath:db/migration", false);
		assertThatThrownBy(normal::migrate).isInstanceOf(FlywayValidateException.class)
		    .hasMessageContaining("Detected resolved migration not applied to database: 20261031065016");
		assertThat(flyway(schema, "classpath:db/migration", true).migrate().migrationsExecuted).isEqualTo(3);
		normal.validate();
		assertThat(normal.migrate().migrationsExecuted).isZero();
		assertThat(jdbc.queryForList("select * from " + schema + ".users order by id")).isEqualTo(users);
		assertThat(jdbc.queryForList("select * from " + schema + ".properties order by id")).isEqualTo(properties);
		assertThat(jdbc.queryForList("select version,checksum from " + schema
		    + ".flyway_schema_history where version not in ('20261031065016','20261031071757','20261031073149')"
		    + " and version is not null order by version")).isEqualTo(checksums);
		assertThat(jdbc.queryForObject("select count(*) from " + schema
		    + ".flyway_schema_history where version in ('20261031065016','20261031071757','20261031073149') and success", Integer.class)).isEqualTo(3);
		assertThat(jdbc.queryForObject("select to_regclass(?) is null", Boolean.class,
		    schema + ".opening_payment_snapshots")).isTrue();
	}

	private Flyway flyway(String schema, String location, boolean outOfOrder) {
		return Flyway.configure().dataSource(POSTGRES.jdbcUrl(), POSTGRES.username(), "")
		    .schemas(schema).defaultSchema(schema).locations(location).target(DEPLOYED_VERSION)
		    .outOfOrder(outOfOrder).load();
	}
}
