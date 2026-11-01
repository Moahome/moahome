package com.moahome.server.billing.dto;

import java.util.List;

/** 저장 전 확인한 부과 대상과 서버 재검증 토큰입니다. 기존 청구를 수정·삭제하는 계획은 포함하지 않습니다. */
public record BankBillingImpact(boolean primary, boolean dateChanged, boolean changed, String previousMonth, String nextMonth,
    List<Month> missingMonths, String blockedReason, String token) {
	public record Month(String month, int unitCount, String amount, boolean initialSettings) {}
}
