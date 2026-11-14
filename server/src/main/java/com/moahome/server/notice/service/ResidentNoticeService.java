package com.moahome.server.notice.service;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import com.moahome.server.common.security.Sha256;
import com.moahome.server.notice.dto.ResidentNoticeResponse;
import com.moahome.server.notice.repo.NoticeAssetRepository;
import com.moahome.server.notice.repo.NoticeRepository;
import com.moahome.server.notice.repo.ResidentNoticeRepository;
import com.moahome.server.notice.repo.ResidentNoticeRepository.Grant;
import com.moahome.server.property.service.ManagementAccessService;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
@Transactional(readOnly = true)
public class ResidentNoticeService {

	public static final Duration SESSION_TTL = Duration.ofHours(12);

	private final ResidentNoticeRepository residents;
	private final NoticeRepository notices;
	private final NoticeAssetRepository assets;
	private final NoticeAssetStorage storage;
	private final ManagementAccessService access;
	private final NoticeLinkTokens tokens;
	private final StringRedisTemplate redis;
	private final Clock clock;
	private final ObjectMapper mapper;

	public ResidentNoticeService(ResidentNoticeRepository residents, NoticeRepository notices,
	    NoticeAssetRepository assets, NoticeAssetStorage storage, ManagementAccessService access,
	    NoticeLinkTokens tokens, StringRedisTemplate redis, Clock clock, ObjectMapper mapper) {
		this.residents = residents;
		this.notices = notices;
		this.assets = assets;
		this.storage = storage;
		this.access = access;
		this.tokens = tokens;
		this.redis = redis;
		this.clock = clock;
		this.mapper = mapper;
	}

	public ResidentNoticeResponse.Link activeLink(UUID actor, UUID propertyId) {
		access.getManagementContext(actor, propertyId);
		return residents.activeGrant(propertyId).map(this::link).orElse(null);
	}

	/** 건물별 활성 링크와 발급 ID를 잠금·유일 제약으로 보호해 동시 클릭과 응답 유실에 중복 발급하지 않습니다. */
	@Transactional
	public ResidentNoticeResponse.Link createLink(UUID actor, UUID propertyId, UUID id) {
		access.getManagementContext(actor, propertyId);
		notices.lock(propertyId);
		access.getManagementContext(actor, propertyId);
		Grant previous = residents.findGrant(id).orElse(null);
		if (previous != null && (!previous.propertyId().equals(propertyId) || previous.revokedAt() != null)) {
			throw new ResponseStatusException(HttpStatus.CONFLICT);
		}
		Grant active = residents.activeGrant(propertyId).orElse(null);
		if (active != null) {
			return link(active);
		}
		String nonce = tokens.random();
		String token = tokens.token(id, nonce);
		Grant grant = new Grant(id, propertyId, nonce, Sha256.hex(token), OffsetDateTime.now(clock), null);
		residents.createGrant(grant, actor);
		return link(grant);
	}

	/** 회수는 반복해도 성공하며 이미 발급한 세션도 다음 요청부터 같은 DB 상태를 보고 거부합니다. */
	@Transactional
	public void revoke(UUID actor, UUID propertyId, UUID id) {
		access.getManagementContext(actor, propertyId);
		notices.lock(propertyId);
		access.getManagementContext(actor, propertyId);
		residents.revoke(propertyId, id, OffsetDateTime.now(clock));
	}

	private ResidentNoticeResponse.Link link(Grant grant) {
		String token;
		try {
			token = tokens.token(grant.id(), grant.nonce());
		} catch (ResponseStatusException exception) {
			// 키 설정 장애 중에도 기존 링크 ID를 반환해 관리자의 회수 동작은 막지 않습니다.
			return new ResidentNoticeResponse.Link(grant.id(), null, grant.createdAt());
		}
		// 키 교체 후 기존 링크는 유효하지만 재구성할 수 없습니다. 다른 토큰으로 조용히 교체하지 않습니다.
		if (!tokens.matches(token, grant.hash())) {
			return new ResidentNoticeResponse.Link(grant.id(), null, grant.createdAt());
		}
		return new ResidentNoticeResponse.Link(grant.id(), token, grant.createdAt());
	}

	/** 링크는 소비하지 않고 난수 세션으로 교환합니다. GET·미리보기는 이 메서드를 호출하지 않습니다. */
	public String exchange(String token) {
		if (token == null || !token.matches("[0-9a-f-]{36}\\.[A-Za-z0-9_-]{43}")) {
			throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
		}
		Grant grant;
		try {
			grant = requireGrant(UUID.fromString(token.substring(0, 36)));
		} catch (IllegalArgumentException exception) {
			throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
		}
		if (!tokens.matches(token, grant.hash())) {
			throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
		}
		String session = tokens.random();
		// Redis 실패 시 쿠키를 발급하지 않습니다. 응답 유실 시 재교환해도 읽기 권한만 새로 생깁니다.
		redis.opsForValue().set(sessionKey(session), grant.id().toString(), SESSION_TTL);
		return session;
	}

	/** 모든 주민 요청에서 세션과 회수 상태를 다시 검사하며 관리자 인증·권한으로 승격하지 않습니다. */
	public ResidentNoticeResponse.Context context(String session) {
		if (session == null || !session.matches("[A-Za-z0-9_-]{43}")) {
			throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
		}
		String id = redis.opsForValue().get(sessionKey(session));
		if (id == null) {
			throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
		}
		Grant grant = requireGrant(UUID.fromString(id));
		return residents.context(grant.propertyId())
		    .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
	}

	private Grant requireGrant(UUID id) {
		Grant grant = residents.findGrant(id).filter(row -> row.revokedAt() == null)
		    .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
		if (residents.context(grant.propertyId()).isEmpty()) {
			throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
		}
		return grant;
	}

	private String sessionKey(String session) {
		return "moahome:notice-access:session:" + Sha256.hex(session);
	}

	/** 중요 공지는 상단 전용 목록에, 일반 공지는 별도 페이지에 반환해 같은 글이 두 영역에 중복되지 않게 합니다. */
	public ResidentNoticeResponse.Listing list(String session, int page, String query) {
		UUID propertyId = context(session).propertyId();
		if (page < 1 || page > 1_000_000 || query.length() > 100) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
		}
		String pattern = "%" + query.strip().toLowerCase(java.util.Locale.ROOT)
		    .replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
		long total = residents.count(propertyId, pattern);
		return new ResidentNoticeResponse.Listing(propertyId, residents.listImportant(propertyId, pattern),
		    residents.list(propertyId, pattern, (page - 1) * 10), total, page, (int) Math.max(1, (total + 9) / 10));
	}

	/** 같은 건물의 미삭제 공지 본문과 원래 작성자의 표시 이름을 주민 상세에 제공합니다. */
	public ResidentNoticeResponse.Detail detail(String session, UUID id) {
		UUID propertyId = context(session).propertyId();
		var detail = requireNotice(propertyId, id).detail();
		return new ResidentNoticeResponse.Detail(propertyId, id, detail.title(), detail.important(),
		    detail.createdAt(), detail.content(), detail.authorName());
	}

	/** 첨부·이미지는 현재 본문에 남아 있는 연결 자산만 허용하고 S3 주소를 노출하지 않습니다. */
	public NoticeAssetService.Download asset(String session, UUID noticeId, UUID assetId) {
		UUID propertyId = context(session).propertyId();
		var notice = requireNotice(propertyId, noticeId);
		var asset = assets.find(assetId).filter(row -> row.propertyId().equals(propertyId)
		    && noticeId.equals(row.noticeId())).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
		String reference = "/api/properties/" + propertyId + "/notices/assets/" + assetId;
		JsonNode document = mapper.readTree(notice.detail().content());
		boolean attached = false;
		for (JsonNode file : document.path("files")) {
			attached |= reference.equals(file.path("data").asString());
		}
		if (!attached && !hasImage(document, reference)) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND);
		}
		return new NoticeAssetService.Download(asset, storage.read(asset.objectKey(), asset.size()));
	}

	private boolean hasImage(JsonNode node, String reference) {
		if ("image".equals(node.path("type").asString())
		    && reference.equals(node.path("attrs").path("src").asString())) {
			return true;
		}
		for (JsonNode child : node.path("content")) {
			if (hasImage(child, reference)) {
				return true;
			}
		}
		return false;
	}

	private NoticeRepository.Stored requireNotice(UUID propertyId, UUID id) {
		return notices.find(propertyId, id).filter(row -> row.deletedAt() == null)
		    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
	}
}
