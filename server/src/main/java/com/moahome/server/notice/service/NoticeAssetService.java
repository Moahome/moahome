package com.moahome.server.notice.service;

import com.moahome.server.common.security.Sha256;
import java.io.IOException;
import java.util.UUID;
import javax.imageio.ImageIO;
import java.io.ByteArrayInputStream;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import com.moahome.server.notice.repo.NoticeAssetRepository;
import com.moahome.server.notice.repo.NoticeAssetRepository.Asset;
import com.moahome.server.notice.repo.NoticeRepository;
import com.moahome.server.property.service.ManagementAccessService;
import tools.jackson.databind.JsonNode;

@Service
public class NoticeAssetService {
	public record Uploaded(UUID id, String name, long size, String data) {
	}
	public record Download(Asset asset, byte[] bytes) {
	}
	private final NoticeAssetRepository assets;
	private final NoticeRepository notices;
	private final NoticeAssetStorage storage;
	private final ManagementAccessService access;

	public NoticeAssetService(NoticeAssetRepository assets, NoticeRepository notices,
		NoticeAssetStorage storage, ManagementAccessService access) {
		this.assets = assets;
		this.notices = notices;
		this.storage = storage;
		this.access = access;
	}

	/** 업로드 ID와 해시를 함께 비교해 응답 유실 뒤 같은 파일의 재전송만 성공 처리합니다. */
	@Transactional
	public Uploaded upload(UUID actor, UUID propertyId, UUID id, MultipartFile file, boolean image) {
		access.getManagementContext(actor, propertyId);
		String name = file.getOriginalFilename();
		if (file.isEmpty() || file.getSize() > 20 * 1024 * 1024 || name == null || name.isBlank()
			|| name.length() > 255 || name.chars().anyMatch(Character::isISOControl)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
		}
		byte[] bytes;
		try {
			bytes = file.getBytes();
		} catch (IOException exception) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
		}
		String type = image ? imageType(bytes) : "application/octet-stream";
		String hash = hash(bytes);
		assets.lock(id);
		Asset previous = assets.find(id).orElse(null);
		if (previous != null) {
			if (!previous.uploadedBy().equals(actor) || !previous.propertyId().equals(propertyId)) {
				throw new ResponseStatusException(HttpStatus.FORBIDDEN);
			}
			if (!previous.hash().equals(hash) || !previous.name().equals(name) || previous.image() != image) {
				throw new ResponseStatusException(HttpStatus.CONFLICT);
			}
			return uploaded(previous);
		}
		// 외부 저장은 DB 롤백 대상이 아닙니다. 해시가 포함된 결정적 키로 재시도하며 실패 객체는 공개하지 않습니다.
		String key = "notices/" + propertyId + "/" + actor + "/" + id + "/" + hash;
		storage.put(key, bytes, type);
		Asset asset = new Asset(id, propertyId, actor, null, key, name, type, bytes.length, hash, image);
		assets.create(asset);
		return uploaded(asset);
	}

	/** 초안 파일은 업로더만, 게시 파일은 현재 관리 권한과 게시 상태를 확인한 뒤 읽습니다. */
	@Transactional(readOnly = true)
	public Download read(UUID actor, UUID propertyId, UUID id) {
		access.getManagementContext(actor, propertyId);
		Asset asset = requireAsset(propertyId, id);
		if (!asset.uploadedBy().equals(actor)) {
			if (asset.noticeId() == null || notices.find(propertyId, asset.noticeId())
				.filter(row -> row.deletedAt() == null).isEmpty()) {
				throw new ResponseStatusException(HttpStatus.NOT_FOUND);
			}
		}
		return new Download(asset, storage.read(asset.objectKey(), asset.size()));
	}

	/** 게시·수정과 같은 트랜잭션에서 해당 계정의 업로드만 연결하고 다른 글의 파일을 탈취하지 못하게 합니다. */
	public void bindContent(UUID actor, UUID propertyId, UUID noticeId, JsonNode document) {
		bindNode(actor, propertyId, noticeId, document);
		for (JsonNode file : document.path("files")) {
			String reference = file.path("data").asString("");
			if (reference.startsWith("data:")) continue; // 기존 Base64 자료는 읽기·수정 중 소실시키지 않습니다.
			Asset asset = bindReference(actor, propertyId, noticeId, reference, false);
			if (!asset.name().equals(file.path("name").asString("")) || asset.size() != file.path("size").asLong()) {
				throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
			}
		}
	}

	private void bindNode(UUID actor, UUID propertyId, UUID noticeId, JsonNode node) {
		if (node.path("type").asString("").equals("image")) {
			String reference = node.path("attrs").path("src").asString("");
			if (!reference.startsWith("data:")) bindReference(actor, propertyId, noticeId, reference, true);
		}
		for (JsonNode child : node.path("content")) bindNode(actor, propertyId, noticeId, child);
	}

	private Asset bindReference(UUID actor, UUID propertyId, UUID noticeId, String reference, boolean image) {
		String prefix = "/api/properties/" + propertyId + "/notices/assets/";
		if (!reference.startsWith(prefix)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
		UUID id;
		try {
			id = UUID.fromString(reference.substring(prefix.length()));
		} catch (IllegalArgumentException exception) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
		}
		assets.lock(id);
		Asset asset = requireAsset(propertyId, id);
		if (!asset.uploadedBy().equals(actor) || (asset.noticeId() != null && !asset.noticeId().equals(noticeId))) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN);
		}
		if (asset.image() != image) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
		assets.bind(id, noticeId);
		return asset;
	}

	private Asset requireAsset(UUID propertyId, UUID id) {
		return assets.find(id).filter(asset -> asset.propertyId().equals(propertyId))
			.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
	}

	private Uploaded uploaded(Asset asset) {
		return new Uploaded(asset.id(), asset.name(), asset.size(),
			"/api/properties/" + asset.propertyId() + "/notices/assets/" + asset.id());
	}

	/** MIME 문자열만 신뢰하지 않고 실제로 해석 가능한 PNG·JPEG·WebP만 본문 이미지로 허용합니다. */
	private String imageType(byte[] bytes) {
		if (bytes.length >= 12 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
			&& bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P') {
			return "image/webp";
		}
		try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
			var readers = ImageIO.getImageReaders(input);
			if (!readers.hasNext()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
			var reader = readers.next();
			try {
				reader.setInput(input);
				String format = reader.getFormatName().toLowerCase();
				if (!java.util.Set.of("png", "jpeg", "webp").contains(format)
					|| (long) reader.getWidth(0) * reader.getHeight(0) > 40_000_000) {
					throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
				}
				return "image/" + format;
			} finally {
				reader.dispose();
			}
		} catch (IOException exception) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
		}
	}

	private String hash(byte[] bytes) {
		return Sha256.hex(bytes);
	}
}
