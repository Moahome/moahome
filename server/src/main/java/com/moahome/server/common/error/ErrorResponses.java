package com.moahome.server.common.error;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;

public final class ErrorResponses {

	private ErrorResponses() {
	}

	/** 업무별 코드·문구는 호출자가 정하고 모든 공통 오류 응답의 캐시를 차단합니다. */
	public static ResponseEntity<ErrorResponse> of(HttpStatusCode status, String code, String message) {
		return of(status.value(), code, message);
	}

	/** 인증 challenge나 파일 요청의 JSON Content-Type 등 전송별 추가 헤더는 호출자가 지정합니다. */
	public static ResponseEntity.BodyBuilder builder(HttpStatusCode status) {
		return builder(status.value());
	}

	public static ResponseEntity.BodyBuilder builder(int status) {
		return ResponseEntity.status(status).cacheControl(CacheControl.noStore());
	}

	public static ResponseEntity<ErrorResponse> of(int status, String code, String message) {
		return builder(status).body(new ErrorResponse(code, message));
	}
}
