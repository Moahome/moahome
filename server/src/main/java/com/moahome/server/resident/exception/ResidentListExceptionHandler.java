package com.moahome.server.resident.exception;

import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.auth.security.AuthErrorHandler.ErrorResponse;
import com.moahome.server.resident.controller.ResidentListController;
import com.moahome.server.resident.controller.ResidentRegistrationController;
import com.moahome.server.user.exception.UserException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice(assignableTypes = {ResidentListController.class, ResidentRegistrationController.class, com.moahome.server.resident.controller.ResidentImportController.class, com.moahome.server.resident.controller.ResidentManagementController.class, com.moahome.server.resident.controller.ResidentExportController.class})
public class ResidentListExceptionHandler {
	/** 입력값·SQL·명부·전화번호 원문 대신 원인별 고정 안내만 반환합니다. */
	@ExceptionHandler({IllegalArgumentException.class, org.springframework.web.bind.MethodArgumentNotValidException.class,
		org.springframework.http.converter.HttpMessageNotReadableException.class,
        org.springframework.web.multipart.support.MissingServletRequestPartException.class})
	public ResponseEntity<ErrorResponse> invalid(Exception exception) {
		return error(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "주민 정보를 확인해주세요.");
	}
	@ExceptionHandler(ResidentRegistrationException.class)
	public ResponseEntity<ErrorResponse> registration(ResidentRegistrationException exception) {
		var code = exception.code();
		return error(code.status, code.name(), code.message);
	}
    @ExceptionHandler({ResidentImportException.class, org.springframework.web.multipart.MaxUploadSizeExceededException.class})
    public ResponseEntity<ErrorResponse> excel(Exception exception) {
        String code = exception instanceof ResidentImportException failure ? failure.code() : "INVALID_EXCEL_FILE";
        String message = switch (code) {
            case "IMPORT_EXPIRED" -> "검증 정보가 만료되었거나 접근할 수 없어요. 파일을 다시 올려주세요.";
            case "EXCEL_ROW_LIMIT" -> "한 번에 최대 1,000행까지 등록할 수 있어요.";
            case "INVALID_EXCEL_HEADER" -> "양식의 첫 행을 동·호수·이름·주민 구분·연락처 순서로 맞춰주세요.";
            case "EMPTY_EXCEL_FILE" -> "입력된 주민이 없어요.";
            default -> "5MB 이하의 올바른 .xlsx 파일을 선택해주세요.";
        };
        return error(code.equals("IMPORT_EXPIRED") ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST, code, message);
    }
	@ExceptionHandler(AuthException.class)
	public ResponseEntity<ErrorResponse> auth(AuthException exception) {
		return error(exception.code().status(), exception.code().name(), exception.code().message());
	}
	@ExceptionHandler(UserException.class)
	public ResponseEntity<ErrorResponse> account(UserException exception) {
		return error(HttpStatus.FORBIDDEN, "ACCOUNT_UNAVAILABLE", "계정을 사용할 수 없습니다.");
	}
	@ExceptionHandler(DataAccessException.class)
	public ResponseEntity<ErrorResponse> unavailable(DataAccessException exception) {
		return error(HttpStatus.SERVICE_UNAVAILABLE, "RESIDENT_SERVICE_UNAVAILABLE", "주민 목록을 조회하지 못했습니다.");
	}
	@ExceptionHandler(Exception.class)
	public ResponseEntity<ErrorResponse> unexpected(Exception exception) {
		return error(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "요청을 처리하지 못했습니다.");
	}
	private ResponseEntity<ErrorResponse> error(HttpStatus status, String code, String message) {
		return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(new ErrorResponse(code, message));
	}
}
