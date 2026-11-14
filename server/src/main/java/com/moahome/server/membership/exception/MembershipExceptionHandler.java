package com.moahome.server.membership.exception;

import org.springframework.web.bind.annotation.RestControllerAdvice;
import com.moahome.server.common.error.BusinessExceptionHandler;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.http.ResponseEntity;
import com.moahome.server.common.error.ErrorResponse;
import com.moahome.server.common.error.ErrorResponses;
import com.moahome.server.resident.exception.ResidentRegistrationException;
import com.moahome.server.membership.controller.InvitationClaimController;
import com.moahome.server.membership.controller.MemberManagementController;
import com.moahome.server.membership.controller.MembershipRequestController;

@RestControllerAdvice(assignableTypes = {InvitationClaimController.class, MemberManagementController.class,
        MembershipRequestController.class})
public class MembershipExceptionHandler extends BusinessExceptionHandler {

	public MembershipExceptionHandler() {
		// 기존 Client·API 계약과의 호환을 위해 저장소 오류 코드 이름은 유지합니다.
		super("회원·초대 정보를 확인해주세요.", "PAYMENT_CONFLICT", "회원·초대 정보가 변경되었습니다. 다시 확인해주세요.", "PAYMENT_SERVICE_UNAVAILABLE",
		    "회원·초대 정보를 처리하지 못했습니다.");
	}

	/** 가입·초대의 연락처 동의 오류는 주민 입력 계약을 그대로 따릅니다. */
	@ExceptionHandler(ResidentRegistrationException.class)
	public ResponseEntity<ErrorResponse> resident(ResidentRegistrationException exception) {
		return ErrorResponses.of(exception.code().status, exception.code().name(), exception.code().message);
	}
}
