package com.moahome.server.billing.exception;
import org.springframework.http.HttpStatus;
public class BillingException extends RuntimeException {
    public enum Code {
        BILLING_SETTINGS_NOT_FOUND(HttpStatus.NOT_FOUND, "관리비 설정을 찾을 수 없습니다."),
        BILLING_CHARGE_NOT_FOUND(HttpStatus.NOT_FOUND, "청구 내역을 찾을 수 없습니다."),
        BILLING_SETTINGS_CONFLICT(HttpStatus.CONFLICT, "관리비 설정이 변경되었습니다. 최신 설정을 확인해주세요.");
        public final HttpStatus status;
        public final String message;
        Code(HttpStatus status, String message) { this.status=status; this.message=message; }
    }
    private final Code code;
    public BillingException(Code code) { super(code.message); this.code=code; }
    public Code code() { return code; }
}
