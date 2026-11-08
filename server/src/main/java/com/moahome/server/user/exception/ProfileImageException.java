package com.moahome.server.user.exception;

import org.springframework.http.HttpStatus;

/** 이미지 원문·파일명·AWS 오류를 공개하지 않고 사진 요청의 실패 원인만 구분합니다. */
public class ProfileImageException extends RuntimeException {
	public enum Code {
		INVALID_PROFILE_IMAGE(HttpStatus.BAD_REQUEST, "PNG 또는 JPEG 사진을 선택해주세요."),
		PROFILE_IMAGE_TOO_LARGE(HttpStatus.CONTENT_TOO_LARGE, "사진은 5MB 이하로 선택해주세요."),
		PROFILE_IMAGE_NOT_FOUND(HttpStatus.NOT_FOUND, "프로필 사진이 없습니다."),
		PROFILE_IMAGE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "사진을 처리하지 못했어요. 잠시 후 다시 시도해주세요.");

		private final HttpStatus status;
		private final String message;

		Code(HttpStatus status, String message) {
			this.status = status;
			this.message = message;
		}

		public HttpStatus status() {
			return status;
		}

		public String message() {
			return message;
		}
	}

	private final Code code;

	public ProfileImageException(Code code) {
		super(code.name());
		this.code = code;
	}

	public Code code() {
		return code;
	}
}
