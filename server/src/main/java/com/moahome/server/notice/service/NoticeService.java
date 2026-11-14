package com.moahome.server.notice.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.Base64;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.notice.dto.NoticeResponse;
import com.moahome.server.notice.dto.NoticeSaveRequest;
import com.moahome.server.notice.repo.NoticeRepository;
import com.moahome.server.property.service.ManagementAccessService;

@Service
public class NoticeService {

	private static final Set<String> TYPES = Set.of("doc", "paragraph", "text", "heading", "bulletList", "orderedList",
		"listItem", "blockquote", "hardBreak", "horizontalRule", "image", "codeBlock");
	private static final Set<String> MARKS = Set.of("bold", "italic", "underline", "strike", "code", "link", "textStyle");
	private final NoticeRepository notices;
	private final ManagementAccessService access;
	private final ObjectMapper mapper;
	private final Clock clock;
	private final NoticeAssetService assets;

	public NoticeService(NoticeRepository notices, ManagementAccessService access, ObjectMapper mapper, Clock clock, NoticeAssetService assets) {
		this.notices = notices;
		this.access = access;
		this.mapper = mapper;
		this.clock = clock;
		this.assets = assets;
	}

	/** 현재 관리자 권한을 확인하고 검색 목록과 건수를 같은 스냅샷에서 읽습니다. */
	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	public NoticeResponse.Listing list(UUID actor, UUID propertyId, int page, String query, String field) {
		access.getManagementContext(actor, propertyId);
		if (page < 1 || page > 1000000 || query.length() > 100 || !Set.of("title", "content").contains(field)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
		}
		String pattern = "%" + query.strip().toLowerCase(Locale.ROOT).replace("\\", "\\\\")
			.replace("%", "\\%").replace("_", "\\_") + "%";
		long total = notices.count(propertyId, pattern, field.equals("content"));
		return new NoticeResponse.Listing(propertyId, notices.list(propertyId, pattern, field.equals("content"), (page - 1) * 10),
			total, page, Math.max(1, (int) ((total + 9) / 10)));
	}

	/** 작성자 본인의 확인·수정 진입은 집계하지 않고 다른 관리자의 열람 횟수만 올립니다. */
	@Transactional
	public NoticeResponse.Detail get(UUID actor, UUID propertyId, UUID id) {
		PropertyMemberRole role = access.getManagementContext(actor, propertyId).role();
		NoticeRepository.Stored current = requireVisible(propertyId, id);
		// 화면 숨김이나 클라이언트 값에 의존하지 않고 저장된 원래 작성자와 인증된 사용자를 비교합니다.
		if (current.createdBy().equals(actor)) {
			return response(current, actor, role);
		}
		notices.incrementViews(propertyId, id);
		return response(requireVisible(propertyId, id), actor, role);
	}

	/** 같은 작업 ID 재전송은 내용을 비교해 기존 결과를 반환하고 수정 버전 충돌은 덮어쓰지 않습니다. */
	@Transactional
	public NoticeResponse.Detail save(UUID actor, UUID propertyId, UUID id, NoticeSaveRequest request) {
		access.getManagementContext(actor, propertyId);
		validateContent(request.content());
		String fingerprint = fingerprint(request);
		notices.lock(propertyId);
		PropertyMemberRole role = access.getManagementContext(actor, propertyId).role();
		NoticeRepository.Stored current = notices.find(propertyId, id).orElse(null);
		if (current == null) {
			if (request.expectedVersion() != 0) {
				throw new ResponseStatusException(HttpStatus.NOT_FOUND);
			}
			notices.create(propertyId, id, actor, request, fingerprint, OffsetDateTime.now(clock));
			assets.bindContent(actor, propertyId, id, mapper.readTree(request.content()));
			return response(requireVisible(propertyId, id), actor, role);
		}
		if (current.deletedAt() != null) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND);
		}
		// 관리소장·동대표 역할이 있어도 다른 사람이 작성한 공지를 수정하지 못하게 합니다.
		if (!current.createdBy().equals(actor)) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN);
		}
		if (request.expectedVersion() == 0 || current.requestId().equals(request.requestId())) {
			String previous = request.expectedVersion() == 0 ? current.creationFingerprint() : current.fingerprint();
			if (!previous.equals(fingerprint)) {
				throw new ResponseStatusException(HttpStatus.CONFLICT);
			}
			return response(current, actor, role);
		}
		if (current.detail().version() != request.expectedVersion()) {
			throw new ResponseStatusException(HttpStatus.CONFLICT);
		}
		notices.update(propertyId, id, actor, request, fingerprint, OffsetDateTime.now(clock));
		assets.bindContent(actor, propertyId, id, mapper.readTree(request.content()));
		return response(requireVisible(propertyId, id), actor, role);
	}

	/** 현재 삭제 권한을 확인하고 이미 삭제한 글은 성공 처리하며 오래된 버전의 삭제는 거부합니다. */
	@Transactional
	public void delete(UUID actor, UUID propertyId, UUID id, long version) {
		access.getManagementContext(actor, propertyId);
		notices.lock(propertyId);
		PropertyMemberRole role = access.getManagementContext(actor, propertyId).role();
		NoticeRepository.Stored current = notices.find(propertyId, id)
			.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
		// 관리소장은 타인의 공지도 삭제할 수 있지만 동대표는 작성한 글만 삭제합니다. 재시도도 현재 역할을 검사합니다.
		if (!canDelete(current, actor, role)) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN);
		}
		if (current.deletedAt() != null) {
			return;
		}
		if (current.detail().version() != version) {
			throw new ResponseStatusException(HttpStatus.CONFLICT);
		}
		notices.delete(propertyId, id, actor, OffsetDateTime.now(clock));
	}

	private NoticeRepository.Stored requireVisible(UUID propertyId, UUID id) {
		return notices.find(propertyId, id).filter(row -> row.deletedAt() == null)
			.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
	}

	/** 작성자 전용 수정 권한과 관리소장·작성자의 삭제 권한을 분리해 응답합니다. */
	private NoticeResponse.Detail response(NoticeRepository.Stored stored, UUID actor, PropertyMemberRole role) {
		NoticeResponse.Detail row = stored.detail();
		return new NoticeResponse.Detail(row.propertyId(), row.id(), row.number(), row.title(), row.content(),
			row.important(), row.createdAt(), row.updatedAt(), row.views(), row.version(), stored.createdBy().equals(actor),
			canDelete(stored, actor, role), row.authorName());
	}

	/** 버튼 표시와 실제 삭제 요청에 같은 기준을 사용하며 역할은 현재 관리대상에서 확인한 값만 받습니다. */
	private boolean canDelete(NoticeRepository.Stored stored, UUID actor, PropertyMemberRole role) {
		return role == PropertyMemberRole.ADMIN || stored.createdBy().equals(actor);
	}

	/** HTML 원문을 저장하지 않고 편집기가 지원하는 문서·서식과 제한된 이미지·링크만 허용합니다. */
	private void validateContent(String content) {
		try {
			JsonNode document = mapper.readTree(content);
			if (document == null || !document.path("type").asString("").equals("doc")) {
				throw new IllegalArgumentException();
			}
			validateNode(document, 0);
			JsonNode files = document.path("files");
			if (!files.isMissingNode() && (!files.isArray() || files.size() > 10)) {
				throw new IllegalArgumentException();
			}
			for (JsonNode file : files) {
				String name = file.path("name").asString("");
				String data = file.path("data").asString("");
				String prefix = "data:application/octet-stream;base64,";
				if (name.isBlank() || name.length() > 255 || name.chars().anyMatch(Character::isISOControl)
					|| (!data.startsWith(prefix) && !isAssetReference(data))) {
					throw new IllegalArgumentException();
				}
				if (isAssetReference(data)) continue;
				byte[] bytes = Base64.getDecoder().decode(data.substring(prefix.length()));
				if (bytes.length > 2 * 1024 * 1024 || bytes.length != file.path("size").asLong(-1)) {
					throw new IllegalArgumentException();
				}
			}
		} catch (RuntimeException exception) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_NOTICE_CONTENT");
		}
	}

	private boolean isAssetReference(String value) {
		return value.matches("/api/properties/[0-9a-f-]{36}/notices/assets/[0-9a-f-]{36}");
	}

	private void validateNode(JsonNode node, int depth) {
		if (depth > 30 || !node.isObject() || !TYPES.contains(node.path("type").asString(""))) {
			throw new IllegalArgumentException();
		}
		if (node.path("type").asString("").equals("image")) {
			String src = node.path("attrs").path("src").asString("");
			if (!isAssetReference(src) && !src.matches("data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+")) {
				throw new IllegalArgumentException();
			}
		}
		for (JsonNode mark : node.path("marks")) {
			String type = mark.path("type").asString("");
			if (!MARKS.contains(type)) {
				throw new IllegalArgumentException();
			}
			if (type.equals("link") && !mark.path("attrs").path("href").asString("").matches("https?://[^\\s]+")) {
				throw new IllegalArgumentException();
			}
			if (type.equals("textStyle") && !Set.of("14px", "16px", "20px", "24px")
				.contains(mark.path("attrs").path("fontSize").asString("16px"))) {
				throw new IllegalArgumentException();
			}
		}
		for (JsonNode child : node.path("content")) {
			validateNode(child, depth + 1);
		}
	}

	/** 본문 원문을 로그에 남기지 않고 동일 작업의 제목·내용·중요 설정을 SHA-256으로 비교합니다. */
	private String fingerprint(NoticeSaveRequest request) {
		try {
			String value = mapper.writeValueAsString(new Object[] {
				request.title().strip(), request.content(), request.important(), request.expectedVersion()
			});
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
		} catch (NoSuchAlgorithmException exception) {
			throw new IllegalStateException(exception);
		}
	}
}
