package com.moahome.server.membership.exception;

import org.springframework.http.HttpStatus;
import com.moahome.server.common.error.BusinessException;

/** 회원 업무의 공개 오류 코드·상태·안내를 관리합니다. 기존 코드와 상태 분류를 유지합니다. */
public class MembershipException extends BusinessException {

	public MembershipException(String code) {
		super(status(code), code, message(code));
	}

	private static HttpStatus status(String code) {
		if (code.equals("INVITATION_SERVICE_UNAVAILABLE")) {
			return HttpStatus.SERVICE_UNAVAILABLE;
		}
		if (code.startsWith("INVALID_")) {
			return HttpStatus.BAD_REQUEST;
		}
		if (code.endsWith("NOT_FOUND")) {
			return HttpStatus.NOT_FOUND;
		}
		return HttpStatus.CONFLICT;
	}

	private static String message(String code) {
		return switch (code) {
			case "MEMBER_TRANSFER_REQUIRED" -> "다른 사람에게 관리소장 역할을 인계한 뒤 나갈 수 있어요.";
			case "MEMBER_REPRESENTATIVE_REQUIRED" -> "관리소장에게 세대 대표 변경을 요청한 뒤 퇴거해주세요.";
			case "INVITATION_SERVICE_UNAVAILABLE" -> "초대코드를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
			default -> "회원·초대 정보를 확인해주세요.";
		};
	}
}
