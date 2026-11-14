package com.moahome.server.notice.service;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import com.moahome.server.auth.support.RedisTestServer;
import com.moahome.server.common.security.Sha256;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.notice.dto.NoticeSaveRequest;
import com.moahome.server.notice.dto.ResidentNoticeResponse;
import com.moahome.server.notice.repo.NoticeAssetRepository;
import com.moahome.server.notice.repo.NoticeRepository;
import com.moahome.server.notice.repo.ResidentNoticeRepository;
import com.moahome.server.property.dto.ManagementPropertyResponse;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.user.support.PostgresTestServer;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ResidentNoticePersistenceTest {

	/** 실제 Migration·잠금·Redis 세션으로 건물 범위와 재시도·회수 경계를 한 흐름에서 확인합니다. */
	@Test
	void showsAllPropertyNoticesWithoutPublicationAndRevokesExistingSessions() throws Exception {
		try (PostgresTestServer postgres = new PostgresTestServer(); RedisTestServer redisServer = new RedisTestServer()) {
			DriverManagerDataSource source = new DriverManagerDataSource(postgres.jdbcUrl(), postgres.username(), "");
			JdbcTemplate jdbc = new JdbcTemplate(source);
			Flyway.configure().dataSource(source).target("20261113144253").load().migrate();
			UUID actor = UUID.randomUUID();
			UUID property = UUID.randomUUID();
			UUID otherProperty = UUID.randomUUID();
			jdbc.update("insert into users(id,display_name,status) values (?,'관리자','ACTIVE')", actor);
			for (UUID id : List.of(property, otherProperty)) {
				jdbc.update("insert into properties(id,name,address,has_buildings,status,created_at,updated_at) "
				    + "values (?,'주민 건물','주소',false,'ACTIVE',now(),now())", id);
			}
			NoticeRepository notices = new NoticeRepository(jdbc);
			UUID notice = UUID.randomUUID();
			String content = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"안내\"}]}]}";
			notices.create(property, notice, actor, new NoticeSaveRequest(UUID.randomUUID(), 0, "기존 공지", content, true),
			    "0".repeat(64), OffsetDateTime.now());
			Flyway flyway = Flyway.configure().dataSource(source).load();
			flyway.migrate();
			flyway.validate();
			assertThat(jdbc.queryForObject("select count(*) from information_schema.columns where table_name = 'notices' "
			    + "and column_name = 'resident_published'", Integer.class)).isZero();
			ResidentNoticeRepository residents = new ResidentNoticeRepository(jdbc);
			NoticeAssetRepository assets = new NoticeAssetRepository(jdbc);
			NoticeAssetStorage storage = mock(NoticeAssetStorage.class);
			ManagementAccessService access = mock(ManagementAccessService.class);
			when(access.getManagementContext(any(), any()))
			    .thenReturn(new ManagementPropertyResponse(property, "주민 건물", PropertyMemberRole.ADMIN));
			byte[] keyBytes = new byte[32];
			new SecureRandom().nextBytes(keyBytes);
			String key = Base64.getEncoder().encodeToString(keyBytes);
			MockEnvironment environment = new MockEnvironment().withProperty("moahome.account-security.hmac-key-base64", key);
			NoticeLinkTokens tokens = new NoticeLinkTokens(environment);
			LettuceConnectionFactory connection = new LettuceConnectionFactory("127.0.0.1", redisServer.port());
			connection.afterPropertiesSet();
			connection.start();
			try {
				StringRedisTemplate redis = new StringRedisTemplate(connection);
				ResidentNoticeService service = new ResidentNoticeService(residents, notices, assets, storage, access, tokens,
				    redis, Clock.systemUTC(), JsonMapper.builder().build());
				TransactionTemplate tx = new TransactionTemplate(new DataSourceTransactionManager(source));
				UUID requestId = UUID.randomUUID();
				ResidentNoticeResponse.Link link;
				try (var executor = Executors.newFixedThreadPool(2)) {
					List<Callable<ResidentNoticeResponse.Link>> calls = List.of(
					    () -> tx.execute(status -> service.createLink(actor, property, requestId)),
					    () -> tx.execute(status -> service.createLink(actor, property, UUID.randomUUID())));
					List<Future<ResidentNoticeResponse.Link>> results = executor.invokeAll(calls);
					link = results.getFirst().get();
					assertThat(results.getLast().get()).isEqualTo(link);
				}
				assertThat(service.activeLink(actor, property)).isEqualTo(link);
				// 키를 바꿔도 전달된 링크의 검증 해시는 유지하며 다시 복사만 회수·재발급으로 안내합니다.
				byte[] replacementKey = new byte[32];
				new SecureRandom().nextBytes(replacementKey);
				environment.setProperty("moahome.account-security.hmac-key-base64",
				    Base64.getEncoder().encodeToString(replacementKey));
				assertThat(service.activeLink(actor, property).token()).isNull();
				assertThat(service.context(service.exchange(link.token())).propertyId()).isEqualTo(property);
				environment.setProperty("moahome.account-security.hmac-key-base64", key);
				assertThat(jdbc.queryForObject("select count(*) from notice_access_links", Integer.class)).isEqualTo(1);
				assertThat(jdbc.queryForObject("select token_hash from notice_access_links", String.class))
				    .isEqualTo(Sha256.hex(link.token()));
				assertThatThrownBy(() -> service.exchange(link.id() + "." + "X".repeat(43)))
				    .isInstanceOf(ResponseStatusException.class);
				String session = service.exchange(link.token());
				assertThat(service.context(session).propertyId()).isEqualTo(property);
				// 기존 공지와 새 공지는 별도 공개 설정 없이 같은 건물 링크에서 바로 읽습니다.
				assertThat(service.list(session, 1, "").importantItems()).hasSize(1);
				assertThat(service.list(session, 1, "").items()).isEmpty();
				assertThat(service.list(session, 1, "").total()).isZero();
				assertThat(service.detail(session, notice).title()).isEqualTo("기존 공지");
				assertThat(service.detail(session, notice).authorName()).isEqualTo("관리자");
				// 중요 공지가 한 페이지보다 많아도 일반 공지의 건수·페이지를 밀어내지 않습니다.
				List<UUID> extraNotices = new ArrayList<>();
				for (int index = 0; index < 12; index++) {
					for (boolean important : List.of(true, false)) {
						UUID extraId = UUID.randomUUID();
						extraNotices.add(extraId);
						notices.create(property, extraId, actor,
						    new NoticeSaveRequest(UUID.randomUUID(), 0, "목록 분리 " + index, content, important),
						    "0".repeat(64), OffsetDateTime.now());
					}
				}
				ResidentNoticeResponse.Listing firstPage = service.list(session, 1, "");
				ResidentNoticeResponse.Listing secondPage = service.list(session, 2, "");
				assertThat(firstPage.total()).isEqualTo(12);
				assertThat(firstPage.pageCount()).isEqualTo(2);
				assertThat(firstPage.importantItems()).hasSize(13).allMatch(ResidentNoticeResponse.Summary::important);
				assertThat(firstPage.items()).hasSize(10).allMatch(row -> !row.important());
				assertThat(secondPage.items()).hasSize(2).doesNotContainAnyElementsOf(firstPage.items());
				assertThat(secondPage.importantItems()).isEqualTo(firstPage.importantItems());
				for (UUID extraId : extraNotices) {
					notices.delete(property, extraId, actor, OffsetDateTime.now());
				}
				UUID newNotice = UUID.randomUUID();
				notices.create(property, newNotice, actor,
				    new NoticeSaveRequest(UUID.randomUUID(), 0, "새 공지", content, false), "0".repeat(64), OffsetDateTime.now());
				assertThat(service.list(session, 1, "").items()).extracting(ResidentNoticeResponse.Summary::id)
				    .containsExactly(newNotice);
				assertThat(service.list(session, 1, "").importantItems()).extracting(ResidentNoticeResponse.Summary::id)
				    .containsExactly(notice);
				assertThat(service.detail(session, newNotice).title()).isEqualTo("새 공지");
				notices.delete(property, newNotice, actor, OffsetDateTime.now());
				assertThat(service.list(session, 1, "").items()).isEmpty();
				assertThat(service.list(session, 1, "기존").importantItems()).hasSize(1);
				assertThat(service.list(session, 1, "%").items()).isEmpty();
				assertThat(service.list(session, 1, "%").importantItems()).isEmpty();
				assertThat(service.detail(session, notice).title()).isEqualTo("기존 공지");
				assertThat(notices.find(property, notice).orElseThrow().detail().views()).isZero();
				UUID otherNotice = UUID.randomUUID();
				notices.create(otherProperty, otherNotice, actor,
				    new NoticeSaveRequest(UUID.randomUUID(), 0, "다른 건물", content, false), "0".repeat(64), OffsetDateTime.now());
				assertThatThrownBy(() -> service.detail(session, otherNotice)).isInstanceOf(ResponseStatusException.class);
				// 파일을 과거에 연결했더라도 현재 본문에서 제거됐다면 주민 다운로드는 거부합니다.
				UUID assetId = UUID.randomUUID();
				assets.create(new NoticeAssetRepository.Asset(assetId, property, actor, null, "private/test", "안내.pdf",
				    "application/octet-stream", 1, "0".repeat(64), false));
				assets.bind(assetId, notice);
				assertThatThrownBy(() -> service.asset(session, notice, assetId)).isInstanceOf(ResponseStatusException.class);
				String reference = "/api/properties/" + property + "/notices/assets/" + assetId;
				jdbc.update("update notices set content = ? where id = ?", "{\"type\":\"doc\",\"files\":[{\"data\":\""
				    + reference + "\"}]}", notice);
				when(storage.read("private/test", 1)).thenReturn(new byte[] { 1 });
				assertThat(service.asset(session, notice, assetId).bytes()).containsExactly((byte) 1);
				verify(storage).read("private/test", 1);
				notices.delete(property, notice, actor, OffsetDateTime.now());
				assertThatThrownBy(() -> service.asset(session, notice, assetId)).isInstanceOf(ResponseStatusException.class);
				assertThat(service.list(session, 1, "").items()).isEmpty();
				// 세션이 만료돼도 원래 링크는 재사용할 수 있고 회수 후에는 모든 기존 세션을 거부합니다.
				redis.delete("moahome:notice-access:session:" + Sha256.hex(session));
				assertThatThrownBy(() -> service.context(session)).isInstanceOf(ResponseStatusException.class);
				String again = service.exchange(link.token());
				tx.executeWithoutResult(status -> service.revoke(actor, property, link.id()));
				tx.executeWithoutResult(status -> service.revoke(actor, property, link.id()));
				assertThatThrownBy(() -> service.context(again)).isInstanceOf(ResponseStatusException.class);
				assertThatThrownBy(() -> service.exchange(link.token())).isInstanceOf(ResponseStatusException.class);
				assertThatThrownBy(() -> tx.execute(status -> service.createLink(actor, property, link.id())))
				    .isInstanceOf(ResponseStatusException.class);
				assertThatThrownBy(() -> tx.execute(status -> {
					service.createLink(actor, property, UUID.randomUUID());
					throw new IllegalStateException("rollback");
				})).isInstanceOf(IllegalStateException.class);
				assertThat(service.activeLink(actor, property)).isNull();
				assertThat(tx.execute(status -> service.createLink(actor, property, UUID.randomUUID())).id())
				    .isNotEqualTo(link.id());
			} finally {
				connection.destroy();
			}
		}
	}
}
