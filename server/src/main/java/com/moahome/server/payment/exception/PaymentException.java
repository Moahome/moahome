package com.moahome.server.payment.exception;

/** 입력 원문이나 개인정보를 포함하지 않는 입금 업무 오류입니다. */
public class PaymentException extends RuntimeException {
    private final String code;
    public PaymentException(String code) { super(code); this.code = code; }
    public String code() { return code; }
}
