package com.moahome.server.accounting.domain;

/** 손익 표시 분류는 과목 ID와 함께 저장하며 명칭이나 코드 앞자리로 추정하지 않습니다. */
public enum IncomeGroup {
	OPERATING_REVENUE, OPERATING_EXPENSE, OTHER_REVENUE, OTHER_EXPENSE;

	public boolean isExpense() {
		return this == OPERATING_EXPENSE || this == OTHER_EXPENSE;
	}
}
