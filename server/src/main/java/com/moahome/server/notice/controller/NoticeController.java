package com.moahome.server.notice.controller;

import java.util.UUID;
import java.nio.charset.StandardCharsets;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;
import com.moahome.server.notice.service.NoticeAssetService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.notice.dto.NoticeResponse;
import com.moahome.server.notice.dto.NoticeSaveRequest;
import com.moahome.server.notice.service.NoticeService;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "공지사항")
@SecurityRequirement(name = "bearerAuth")
@RestController
@RequestMapping("/api/properties/{propertyId}/notices")
public class NoticeController {

	private final NoticeService service;
	private final NoticeAssetService assets;

	public NoticeController(NoticeService service, NoticeAssetService assets) {
		this.service = service;
		this.assets = assets;
	}

	/** 업로드 ID는 재전송해도 유지하고 파일은 인증된 계정의 초안 자산으로 저장합니다. */
	@PutMapping(value = "/assets/{assetId}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ResponseEntity<NoticeAssetService.Uploaded> upload(@AuthenticationPrincipal AuthPrincipal actor,
		@PathVariable UUID propertyId, @PathVariable UUID assetId, @RequestParam MultipartFile file,
		@RequestParam(defaultValue = "false") boolean image) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(assets.upload(UUID.fromString(actor.userId()), propertyId, assetId, file, image));
	}

	@GetMapping("/assets/{assetId}")
	public ResponseEntity<byte[]> file(@AuthenticationPrincipal AuthPrincipal actor,
		@PathVariable UUID propertyId, @PathVariable UUID assetId) {
		NoticeAssetService.Download download = assets.read(UUID.fromString(actor.userId()), propertyId, assetId);
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.header("X-Content-Type-Options", "nosniff")
			.header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
				.filename(download.asset().name(), StandardCharsets.UTF_8).build().toString())
			.contentType(MediaType.parseMediaType(download.asset().contentType())).body(download.bytes());
	}

	@GetMapping
	public ResponseEntity<NoticeResponse.Listing> list(@AuthenticationPrincipal AuthPrincipal actor,
		@PathVariable UUID propertyId, @RequestParam(defaultValue = "1") int page,
		@RequestParam(defaultValue = "") String query, @RequestParam(defaultValue = "title") String field) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(service.list(UUID.fromString(actor.userId()), propertyId, page, query, field));
	}

	@GetMapping("/{id}")
	public ResponseEntity<NoticeResponse.Detail> get(@AuthenticationPrincipal AuthPrincipal actor,
		@PathVariable UUID propertyId, @PathVariable UUID id) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(service.get(UUID.fromString(actor.userId()), propertyId, id));
	}

	@PutMapping("/{id}")
	public ResponseEntity<NoticeResponse.Detail> save(@AuthenticationPrincipal AuthPrincipal actor,
		@PathVariable UUID propertyId, @PathVariable UUID id, @Valid @RequestBody NoticeSaveRequest request) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(service.save(UUID.fromString(actor.userId()), propertyId, id, request));
	}

	@DeleteMapping("/{id}")
	public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthPrincipal actor,
		@PathVariable UUID propertyId, @PathVariable UUID id, @RequestParam long version) {
		service.delete(UUID.fromString(actor.userId()), propertyId, id, version);
		return ResponseEntity.noContent().build();
	}
}
