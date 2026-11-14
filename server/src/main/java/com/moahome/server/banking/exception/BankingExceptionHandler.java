package com.moahome.server.banking.exception;

import org.springframework.web.bind.annotation.RestControllerAdvice;
import com.moahome.server.common.error.BusinessExceptionHandler;
import com.moahome.server.banking.controller.BankAccountController;
import com.moahome.server.banking.controller.BankBalanceCheckController;
import com.moahome.server.banking.controller.BankingBalanceController;
import com.moahome.server.banking.controller.BankingController;
import com.moahome.server.property.controller.RegistrationBankImportController;

@RestControllerAdvice(assignableTypes = {BankAccountController.class, BankBalanceCheckController.class,
        BankingBalanceController.class, BankingController.class, RegistrationBankImportController.class})
public class BankingExceptionHandler extends BusinessExceptionHandler {

	public BankingExceptionHandler() {
		// 기존 Client·API 계약과의 호환을 위해 저장소 오류 코드 이름은 유지합니다.
		super("통장 정보를 확인해주세요.", "PAYMENT_CONFLICT", "통장 정보가 변경되었습니다. 다시 확인해주세요.", "PAYMENT_SERVICE_UNAVAILABLE",
		    "통장 정보를 처리하지 못했습니다.");
	}
}
