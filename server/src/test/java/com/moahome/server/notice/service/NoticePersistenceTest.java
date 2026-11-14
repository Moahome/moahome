package com.moahome.server.notice.service;

import java.time.Clock;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.notice.dto.NoticeResponse;
import com.moahome.server.notice.dto.NoticeSaveRequest;
import com.moahome.server.notice.repo.NoticeRepository;
import com.moahome.server.notice.repo.NoticeAssetRepository;
import org.springframework.mock.web.MockMultipartFile;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.user.support.PostgresTestServer;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

class NoticePersistenceTest {

	private static final String CONTENT = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\","
		+ "\"content\":[{\"type\":\"text\",\"text\":\"시설 점검 안내\"}]}]}";

	@Test
	void upgradesSchemaAndPreservesNumbersAcrossReplayConflictRollbackAndDeletion() throws Exception {
		try (PostgresTestServer postgres = new PostgresTestServer()) {
			DriverManagerDataSource source = new DriverManagerDataSource(postgres.jdbcUrl(), postgres.username(), "");
			JdbcTemplate jdbc = new JdbcTemplate(source);
			Flyway.configure().dataSource(source).target("20261113074851").load().migrate();
			UUID actor = UUID.randomUUID();
			UUID property = UUID.randomUUID();
			jdbc.update("insert into users(id,display_name,status) values (?,'테스트 관리자','ACTIVE')", actor);
			jdbc.update("insert into properties(id,name,address,has_buildings,status,created_at,updated_at) "
				+ "values (?,'관리대상','주소',false,'ACTIVE',now(),now())", property);
			Flyway flyway = Flyway.configure().dataSource(source).load();
			flyway.migrate();
			flyway.validate();
			ManagementAccessService access = mock(ManagementAccessService.class);
			NoticeRepository repository = new NoticeRepository(jdbc);
			NoticeAssetRepository assetRepository = new NoticeAssetRepository(jdbc);
			NoticeAssetStorage storage = mock(NoticeAssetStorage.class);
			NoticeAssetService assets = new NoticeAssetService(assetRepository, repository, storage, access);
			NoticeService service = new NoticeService(repository, access, JsonMapper.builder().build(), Clock.systemUTC(), assets);
			TransactionTemplate tx = new TransactionTemplate(new DataSourceTransactionManager(source));
			UUID firstId = UUID.randomUUID();
			NoticeSaveRequest first = request(0, "일반 공지", false);
			NoticeResponse.Detail created = tx.execute(status -> service.save(actor, property, firstId, first));
			assertThat(created.number()).isEqualTo(1);
			// 작성자의 반복 열람은 제외하고 다른 사용자의 동시 열람은 원자적으로 누적합니다.
			assertThat(tx.execute(status -> service.get(actor, property, firstId)).views()).isZero();
			assertThat(tx.execute(status -> service.get(actor, property, firstId)).views()).isZero();
			UUID viewer = UUID.randomUUID();
			try (var executor = Executors.newFixedThreadPool(2)) {
				List<Callable<NoticeResponse.Detail>> calls = List.of(
					() -> tx.execute(status -> service.get(viewer, property, firstId)),
					() -> tx.execute(status -> service.get(viewer, property, firstId)));
				for (var result : executor.invokeAll(calls)) {
					assertThat(result.get().canEdit()).isFalse();
				}
			}
			assertThat(tx.execute(status -> service.get(actor, property, firstId)).views()).isEqualTo(2);
			UUID deniedViewer = UUID.randomUUID();
			doThrow(new AuthException(AuthErrorCode.ACCESS_DENIED)).when(access).getManagementContext(deniedViewer, property);
			assertThatThrownBy(() -> tx.execute(status -> service.get(deniedViewer, property, firstId)))
				.isInstanceOf(AuthException.class);
			assertThat(repository.find(property, firstId).orElseThrow().detail().views()).isEqualTo(2);
			assertThat(tx.execute(status -> service.save(actor, property, firstId, first)).id()).isEqualTo(firstId);
			assertThat(jdbc.queryForObject("select count(*) from notices", Integer.class)).isEqualTo(1);
			assertThatThrownBy(() -> tx.execute(status -> service.save(actor, property, firstId, request(0, "다른 내용", false))))
				.isInstanceOf(ResponseStatusException.class);
			// 동일 생성 요청이 동시에 재전송되어도 한 행·한 번호만 남습니다.
			UUID importantId = UUID.randomUUID();
			NoticeSaveRequest important = request(0, "중요 공지", true);
			try (var executor = Executors.newFixedThreadPool(2)) {
				List<Callable<NoticeResponse.Detail>> calls = List.of(
					() -> tx.execute(status -> service.save(actor, property, importantId, important)),
					() -> tx.execute(status -> service.save(actor, property, importantId, important)));
				for (var result : executor.invokeAll(calls)) {
					assertThat(result.get().number()).isEqualTo(2);
				}
			}
			assertThat(service.list(actor, property, 1, "", "title").items())
				.extracting(NoticeResponse.Summary::number).containsExactly(2L, 1L);
			NoticeSaveRequest edited = request(1, "수정 공지", false);
			assertThat(tx.execute(status -> service.save(actor, property, firstId, edited)).number()).isEqualTo(1);
			assertThat(tx.execute(status -> service.save(actor, property, firstId, edited)).version()).isEqualTo(2);
			assertThatThrownBy(() -> tx.execute(status -> service.save(actor, property, firstId, request(1, "오래된 화면", false))))
				.isInstanceOf(ResponseStatusException.class);
			assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
				service.save(actor, property, UUID.randomUUID(), request(0, "롤백", false));
				throw new IllegalStateException("Rollback test");
			})).isInstanceOf(IllegalStateException.class);
			assertThat(jdbc.queryForObject("select count(*) from notices", Integer.class)).isEqualTo(2);
			tx.executeWithoutResult(status -> service.delete(actor, property, firstId, 2));
			tx.executeWithoutResult(status -> service.delete(actor, property, firstId, 2));
			assertThat(service.list(actor, property, 1, "", "title").items()).hasSize(1);
			assertThat(tx.execute(status -> service.save(actor, property, UUID.randomUUID(), request(0, "다음 공지", false))).number()).isEqualTo(3);
			assertThatThrownBy(() -> service.get(actor, UUID.randomUUID(), importantId)).isInstanceOf(ResponseStatusException.class);
			assertThatThrownBy(() -> tx.execute(status -> service.save(actor, property, UUID.randomUUID(),
				new NoticeSaveRequest(UUID.randomUUID(), 0, "잘못된 본문", "{\"type\":\"script\"}", false))))
				.isInstanceOf(ResponseStatusException.class);
			// 실제 PostgreSQL에서 업로드 재시도·공지 연결·다중 참조·초안 소유권을 함께 검증합니다.
			UUID fileId = UUID.randomUUID();
			byte[] bytes = "attachment".getBytes(java.nio.charset.StandardCharsets.UTF_8);
			MockMultipartFile file = new MockMultipartFile("file", "안내.txt", "text/plain", bytes);
			var uploaded = tx.execute(status -> assets.upload(actor, property, fileId, file, false));
			NoticeAssetService.Uploaded replay = tx.execute(status -> assets.upload(actor, property, fileId, file, false));
			assertThat(replay).isEqualTo(uploaded);
			assertThat(jdbc.queryForObject("select count(*) from notice_assets", Integer.class)).isEqualTo(1);
			verify(storage).put(anyString(), any(byte[].class), anyString());
			assertThatThrownBy(() -> tx.execute(status -> assets.upload(actor, property, fileId,
				new MockMultipartFile("file", "안내.txt", "text/plain", new byte[] { 1 }), false)))
				.isInstanceOf(ResponseStatusException.class);
			UUID other = UUID.randomUUID();
			assertThatThrownBy(() -> assets.read(other, property, fileId)).isInstanceOf(ResponseStatusException.class);
			UUID withFile = UUID.randomUUID();
			String attachedContent = CONTENT.substring(0, CONTENT.length() - 1) + ",\"files\":[{\"id\":\"" + fileId
				+ "\",\"name\":\"안내.txt\",\"size\":" + bytes.length + ",\"data\":\"" + uploaded.data() + "\"}]}";
			NoticeSaveRequest attachmentRequest = new NoticeSaveRequest(UUID.randomUUID(), 0, "첨부 공지", attachedContent, false);
			tx.execute(status -> service.save(actor, property, withFile, attachmentRequest));
			assertThat(assetRepository.find(fileId).orElseThrow().noticeId()).isEqualTo(withFile);
			assertThat(repository.find(property, withFile).orElseThrow().detail().content()).doesNotContain("base64");
			when(storage.read(anyString(), anyLong())).thenReturn(bytes);
			assertThat(assets.read(other, property, fileId).bytes()).isEqualTo(bytes);
			assertThatThrownBy(() -> tx.execute(status -> service.save(actor, property, UUID.randomUUID(), attachmentRequest)))
				.isInstanceOf(ResponseStatusException.class);
			assertThatThrownBy(() -> tx.execute(status -> service.save(other, property, withFile, request(1, "타인 수정", false))))
				.isInstanceOf(ResponseStatusException.class);
			assertThatThrownBy(() -> tx.executeWithoutResult(status -> service.delete(other, property, withFile, 1)))
				.isInstanceOf(ResponseStatusException.class);
			String rgbContent = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{"
				+ "\"type\":\"text\",\"text\":\"RGB 안내\",\"marks\":[{\"type\":\"textStyle\","
				+ "\"attrs\":{\"color\":\"#123abc\",\"fontSize\":\"20px\"}}]}]}]}";
			UUID rgbId = UUID.randomUUID();
			tx.execute(status -> service.save(actor, property, rgbId,
				new NoticeSaveRequest(UUID.randomUUID(), 0, "RGB 공지", rgbContent, false)));
			assertThat(tx.execute(status -> service.get(actor, property, rgbId)).content()).isEqualTo(rgbContent);

			doThrow(new AuthException(AuthErrorCode.ACCESS_DENIED)).when(access).getManagementContext(actor, property);
			assertThatThrownBy(() -> service.list(actor, property, 1, "", "title")).isInstanceOf(AuthException.class);
		}
	}

	private NoticeSaveRequest request(long version, String title, boolean important) {
		return new NoticeSaveRequest(UUID.randomUUID(), version, title, CONTENT, important);
	}
}
