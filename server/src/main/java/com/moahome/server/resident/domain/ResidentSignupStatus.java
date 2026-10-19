package com.moahome.server.resident.domain;

/** 주민 상태와 구분한 현재 세대의 서비스 가입 상태입니다. */
public enum ResidentSignupStatus {
	APPROVED, NOT_JOINED, PENDING;

	/** 실제 승인과 현재 참여가 있으면 가입 완료, 확인된 대기 신청만 있으면 승인 대기로 분류합니다. */
	public static ResidentSignupStatus from(boolean approved, boolean pending) {
		if (approved)
			return APPROVED;
		if (pending)
			return PENDING;
		return NOT_JOINED;
	}
}
