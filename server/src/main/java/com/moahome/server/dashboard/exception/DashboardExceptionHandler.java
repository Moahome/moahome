package com.moahome.server.dashboard.exception;

import org.springframework.web.bind.annotation.RestControllerAdvice;
import com.moahome.server.common.error.BusinessExceptionHandler;
import com.moahome.server.dashboard.controller.DashboardController;

@RestControllerAdvice(assignableTypes = {DashboardController.class})
public class DashboardExceptionHandler extends BusinessExceptionHandler {

	public DashboardExceptionHandler() {
		// 기존 Client·API 계약과의 호환을 위해 저장소 오류 코드 이름은 유지합니다.
		super("대시보드 정보를 확인해주세요.", "PAYMENT_CONFLICT", "대시보드 정보가 변경되었습니다. 다시 확인해주세요.", "PAYMENT_SERVICE_UNAVAILABLE",
		    "대시보드 정보를 처리하지 못했습니다.");
	}
}
