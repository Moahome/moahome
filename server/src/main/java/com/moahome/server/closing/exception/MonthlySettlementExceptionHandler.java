package com.moahome.server.closing.exception;

import org.springframework.web.bind.annotation.RestControllerAdvice;
import com.moahome.server.common.error.BusinessExceptionHandler;
import com.moahome.server.closing.controller.MonthlySettlementController;

@RestControllerAdvice(assignableTypes = {MonthlySettlementController.class})
public class MonthlySettlementExceptionHandler extends BusinessExceptionHandler {

	public MonthlySettlementExceptionHandler() {
		// 기존 Client·API 계약과의 호환을 위해 저장소 오류 코드 이름은 유지합니다.
		super("월 결산 정보를 확인해주세요.", "PAYMENT_CONFLICT", "월 결산 정보가 변경되었습니다. 다시 확인해주세요.", "PAYMENT_SERVICE_UNAVAILABLE",
		    "월 결산 정보를 처리하지 못했습니다.");
	}
}
