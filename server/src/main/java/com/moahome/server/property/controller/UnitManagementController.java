package com.moahome.server.property.controller;

import java.util.UUID;
import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.property.dto.*;
import com.moahome.server.property.service.UnitManagementService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static com.moahome.server.property.exception.UnitManagementException.Code.INVALID_REQUEST;
import com.moahome.server.property.exception.UnitManagementException;

@RestController
@RequestMapping("/api/properties/{propertyId}")
@Tag(name = "세대 관리", description = "저장된 세대·동 조회·추가·수정·삭제")
@SecurityRequirement(name = "bearerAuth")
public class UnitManagementController {
	private final UnitManagementService service;
	public UnitManagementController(UnitManagementService service) { this.service = service; }

	/** 인증 계정과 URL 대상의 현재 권한을 기준으로 목록을 조회합니다. */
	@GetMapping("/units")
	@Operation(summary = "세대 목록 조회")
	public ResponseEntity<UnitListResponse> list(@AuthenticationPrincipal AuthPrincipal principal, @PathVariable String propertyId) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(service.list(UUID.fromString(principal.userId()), parseId(propertyId)));
	}

	/** 초기 등록 이후의 세대 추가는 검증한 단일 요청으로 저장합니다. */
	@PostMapping("/units")
	@Operation(summary = "세대 추가")
	public ResponseEntity<UnitResponse> create(@AuthenticationPrincipal AuthPrincipal principal, @PathVariable String propertyId,
		@Valid @RequestBody UnitRequest request) {
		return ResponseEntity.status(201).cacheControl(CacheControl.noStore())
			.body(service.create(UUID.fromString(principal.userId()), parseId(propertyId), request));
	}

	/** 수정할 세대 ID는 URL에서 받고 관리대상 간 이동은 허용하지 않습니다. */
	@PutMapping("/units/{unitId}")
	@Operation(summary = "세대 기본 정보 수정")
	public ResponseEntity<UnitResponse> update(@AuthenticationPrincipal AuthPrincipal principal, @PathVariable String propertyId,
		@PathVariable String unitId, @Valid @RequestBody UnitRequest request) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(service.update(UUID.fromString(principal.userId()), parseId(propertyId), parseId(unitId), request));
	}

	/** 미리보기에서 확인한 새 세대를 한 트랜잭션으로 저장합니다. */
	@PostMapping("/units/batch")
	@Operation(summary = "세대 일괄 추가")
	public ResponseEntity<java.util.List<UnitResponse>> createBatch(@AuthenticationPrincipal AuthPrincipal principal,
		@PathVariable String propertyId, @Valid @RequestBody UnitBatchRequest request) {
		return ResponseEntity.status(201).cacheControl(CacheControl.noStore())
			.body(service.createBatch(UUID.fromString(principal.userId()), parseId(propertyId), request));
	}

	/** 동 추가에도 세대 관리와 동일한 현재 관리 권한 검증을 적용합니다. */
	@PostMapping("/buildings")
	@Operation(summary = "동 추가")
	public ResponseEntity<UnitListResponse.BuildingItem> createBuilding(@AuthenticationPrincipal AuthPrincipal principal,
		@PathVariable String propertyId, @Valid @RequestBody BuildingRequest request) {
		return ResponseEntity.status(201).cacheControl(CacheControl.noStore())
			.body(service.createBuilding(UUID.fromString(principal.userId()), parseId(propertyId), request));
	}

	/** 동 이름 수정은 URL의 대상 안에서 같은 동 ID를 유지합니다. */
	@PutMapping("/buildings/{buildingId}")
	@Operation(summary = "동 이름 수정")
	public ResponseEntity<UnitListResponse.BuildingItem> updateBuilding(@AuthenticationPrincipal AuthPrincipal principal,
		@PathVariable String propertyId, @PathVariable String buildingId, @Valid @RequestBody BuildingRequest request) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(service.updateBuilding(UUID.fromString(principal.userId()), parseId(propertyId), parseId(buildingId), request));
	}

	/** 개별 삭제에도 선택 삭제와 같은 소속 검증·소프트 삭제 처리를 적용합니다. */
	@DeleteMapping("/units/{unitId}")
	@Operation(summary = "세대 삭제")
	public ResponseEntity<Void> deleteUnit(@AuthenticationPrincipal AuthPrincipal principal,
		@PathVariable String propertyId, @PathVariable String unitId) {
		service.deleteUnits(UUID.fromString(principal.userId()), parseId(propertyId), java.util.List.of(parseId(unitId)));
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}

	/** 선택한 ID 전체를 한 트랜잭션으로 삭제하며 응답에는 개인정보를 포함하지 않습니다. */
	@DeleteMapping("/units")
	@Operation(summary = "선택 세대 삭제")
	public ResponseEntity<Void> deleteUnits(@AuthenticationPrincipal AuthPrincipal principal,
		@PathVariable String propertyId, @Valid @RequestBody UnitDeleteRequest request) {
		service.deleteUnits(UUID.fromString(principal.userId()), parseId(propertyId), request.unitIds());
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}

	/** 동 삭제는 확인한 동과 연결 세대만 대상으로 하며 관리대상 자체는 유지합니다. */
	@DeleteMapping("/buildings/{buildingId}")
	@Operation(summary = "동과 연결 세대 삭제")
	public ResponseEntity<Void> deleteBuilding(@AuthenticationPrincipal AuthPrincipal principal,
		@PathVariable String propertyId, @PathVariable String buildingId) {
		service.deleteBuilding(UUID.fromString(principal.userId()), parseId(propertyId), parseId(buildingId));
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}

	private UUID parseId(String id) {
		if (!id.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
			throw new UnitManagementException(INVALID_REQUEST);
		}
		return UUID.fromString(id);
	}
}
