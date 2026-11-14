package com.moahome.server.user.controller;

import java.util.UUID;

import com.moahome.server.auth.domain.AuthPrincipal;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.common.error.ErrorResponse;
import com.moahome.server.common.error.ErrorResponses;
import com.moahome.server.user.dto.CurrentUserResponse;
import com.moahome.server.user.dto.ProfileUpdateRequest;
import com.moahome.server.user.dto.ProfileSaveRequest;
import com.moahome.server.user.exception.ProfileImageException;
import com.moahome.server.user.exception.UserException;
import com.moahome.server.user.service.ProfileImageService;
import com.moahome.server.user.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import jakarta.validation.Valid;

@RestController
@Tag(name = "사용자", description = "로그인 계정 정보")
@SecurityRequirement(name = "bearerAuth")
public class UserController {
	private final UserService users;
	private final ProfileImageService images;

	public UserController(UserService users, ProfileImageService images) {
		this.users = users;
		this.images = images;
	}

	/** 요청 입력의 사용자 ID 대신 검증된 Bearer의 계정으로 본인 정보를 조회합니다. */
	@GetMapping("/api/users/me")
	@Operation(summary = "내 정보 조회", description = "검증된 Access Token의 정상 계정을 조회합니다. systemRole은 플랫폼 역할이며 관리대상별 역할과 구분합니다.")
	@ApiResponses({
	        @ApiResponse(responseCode = "200", description = "로그인 계정 정보", content = @Content(mediaType = "application/json", schema = @Schema(implementation = CurrentUserResponse.class))),
	        @ApiResponse(responseCode = "401", description = "인증 없음, 유효하지 않거나 만료된 토큰 / 세션", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class))),
	        @ApiResponse(responseCode = "403", description = "ACCOUNT_UNAVAILABLE / ACCESS_DENIED", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class))),
	        @ApiResponse(responseCode = "503", description = "AUTH_SERVICE_UNAVAILABLE", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class))) })
	public ResponseEntity<CurrentUserResponse> me(
	    @Parameter(hidden = true) @AuthenticationPrincipal AuthPrincipal principal) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
		    .body(users.getCurrentUser(UUID.fromString(principal.userId())));
	}

	/** 사용자 ID는 Bearer에서 가져오며 요청의 표시 이름 외에는 수정할 수 없습니다. */
	@PatchMapping("/api/users/me")
	@Operation(summary = "내 이름 수정", description = "정상 로그인 계정의 표시 이름만 변경합니다. 프로필 이미지·주민 명부·권한은 유지합니다.")
	@ApiResponses({
	        @ApiResponse(responseCode = "200", description = "변경된 본인 정보", content = @Content(schema = @Schema(implementation = CurrentUserResponse.class))),
	        @ApiResponse(responseCode = "400", description = "INVALID_REQUEST"),
	        @ApiResponse(responseCode = "401", description = "인증 실패"),
	        @ApiResponse(responseCode = "403", description = "ACCOUNT_UNAVAILABLE"),
	        @ApiResponse(responseCode = "503", description = "AUTH_SERVICE_UNAVAILABLE") })
	public ResponseEntity<CurrentUserResponse> update(
	    @Parameter(hidden = true) @AuthenticationPrincipal AuthPrincipal principal,
	    @Valid @RequestBody ProfileUpdateRequest request) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
		    .body(users.updateDisplayName(UUID.fromString(principal.userId()), request.displayName()));
	}

	/** 사진 선택·삭제와 이름을 한 번에 저장하며 업로드 키와 대상 계정은 서버에서만 정합니다. */
	@PutMapping(value = "/api/users/me/profile", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@Operation(summary = "내 이름·프로필 사진 저장", description = "displayName과 선택적인 image 또는 removeImage를 저장합니다. PNG/JPEG, 최대 5MB.")
	@ApiResponses({
	        @ApiResponse(responseCode = "200", description = "저장한 본인 정보", content = @Content(mediaType = "application/json", schema = @Schema(implementation = CurrentUserResponse.class))),
	        @ApiResponse(responseCode = "400", description = "INVALID_REQUEST / INVALID_PROFILE_IMAGE", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class))),
	        @ApiResponse(responseCode = "401", description = "인증 실패", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class))),
	        @ApiResponse(responseCode = "403", description = "ACCOUNT_UNAVAILABLE", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class))),
	        @ApiResponse(responseCode = "413", description = "PROFILE_IMAGE_TOO_LARGE", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class))),
	        @ApiResponse(responseCode = "503", description = "PROFILE_IMAGE_UNAVAILABLE / AUTH_SERVICE_UNAVAILABLE", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class))) })
	public ResponseEntity<CurrentUserResponse> saveProfile(
	    @Parameter(hidden = true) @AuthenticationPrincipal AuthPrincipal principal,
	    @Valid @ModelAttribute ProfileSaveRequest request) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
		    .body(images.save(UUID.fromString(principal.userId()), request));
	}

	/** 비공개 S3 사진을 본인 Bearer 인증 후에만 반환하며 브라우저·프록시에 저장하지 않습니다. */
	@GetMapping(value = "/api/users/me/profile-image", produces = MediaType.IMAGE_PNG_VALUE)
	@Operation(summary = "내 프로필 사진 조회", description = "본인 현재 사진의 PNG 바이트입니다. v는 화면 캐시 구분용이며 다른 사진 선택에 사용하지 않습니다.")
	@ApiResponses({
	        @ApiResponse(responseCode = "200", description = "현재 프로필 사진", content = @Content(mediaType = "image/png", schema = @Schema(type = "string", format = "binary"))),
	        @ApiResponse(responseCode = "401", description = "인증 실패", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class))),
	        @ApiResponse(responseCode = "403", description = "ACCOUNT_UNAVAILABLE", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class))),
	        @ApiResponse(responseCode = "404", description = "PROFILE_IMAGE_NOT_FOUND", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class))),
	        @ApiResponse(responseCode = "503", description = "PROFILE_IMAGE_UNAVAILABLE / AUTH_SERVICE_UNAVAILABLE", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponse.class))) })
	public ResponseEntity<byte[]> profileImage(
	    @Parameter(hidden = true) @AuthenticationPrincipal AuthPrincipal principal) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.IMAGE_PNG)
		    .header("X-Content-Type-Options", "nosniff")
		    .body(images.read(UUID.fromString(principal.userId())));
	}

	/** 사진 오류에도 원본 이미지나 저장소 응답을 포함하지 않는 고정 계약을 사용합니다. */
	@ExceptionHandler(ProfileImageException.class)
	public ResponseEntity<ErrorResponse> invalidImage(ProfileImageException exception) {
		ProfileImageException.Code code = exception.code();
		return ErrorResponses.builder(code.status())
		    .contentType(MediaType.APPLICATION_JSON)
		    .body(new ErrorResponse(code.name(), code.message()));
	}

	@ExceptionHandler(MaxUploadSizeExceededException.class)
	public ResponseEntity<ErrorResponse> oversizedImage(MaxUploadSizeExceededException exception) {
		return invalidImage(new ProfileImageException(ProfileImageException.Code.PROFILE_IMAGE_TOO_LARGE));
	}

	/** 잘못된 입력은 원문이나 내부 검증 내용을 공개하지 않고 고정 오류로 반환합니다. */
	@ExceptionHandler({ MethodArgumentNotValidException.class, HttpMessageNotReadableException.class,
	        IllegalArgumentException.class })
	public ResponseEntity<ErrorResponse> invalidProfile(Exception exception) {
		return error(AuthErrorCode.INVALID_REQUEST);
	}

	/** 인증 필터 통과 후 계정이 정지·탈퇴되더라도 이용 불가 응답으로 차단합니다. */
	@ExceptionHandler(UserException.class)
	public ResponseEntity<ErrorResponse> handleUnavailableAccount(UserException exception) {
		return error(AuthErrorCode.ACCOUNT_UNAVAILABLE);
	}

	/** 조회·저장 장애를 로그인 만료와 구분하고 내부 저장소 오류를 응답에 노출하지 않습니다. */
	@ExceptionHandler(DataAccessException.class)
	public ResponseEntity<ErrorResponse> handleUnavailableStorage(DataAccessException exception) {
		return error(AuthErrorCode.AUTH_SERVICE_UNAVAILABLE);
	}

	private ResponseEntity<ErrorResponse> error(AuthErrorCode code) {
		return ErrorResponses.builder(code.status())
		    .contentType(MediaType.APPLICATION_JSON)
		    .body(new ErrorResponse(code.name(), code.message()));
	}
}
