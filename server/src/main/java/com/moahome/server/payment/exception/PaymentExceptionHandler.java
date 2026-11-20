package com.moahome.server.payment.exception;

import org.springframework.web.bind.annotation.RestControllerAdvice;
import com.moahome.server.common.error.BusinessExceptionHandler;
import com.moahome.server.payment.controller.PaymentController;

@RestControllerAdvice(assignableTypes = {PaymentController.class})
public class PaymentExceptionHandler extends BusinessExceptionHandler {

	public PaymentExceptionHandler() {
		// 기존 Client·API 계약과의 호환을 위해 저장소 오류 코드 이름은 유지합니다.
		super("입금 정보를 확인해주세요.", "PAYMENT_CONFLICT", "입금 정보가 변경되었습니다. 다시 확인해주세요.",
			"PAYMENT_SERVICE_UNAVAILABLE", "입금 정보를 처리하지 못했습니다.");
	}
}
