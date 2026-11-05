package com.moahome.server.accounting.domain;

/** 손익 표시 분류는 과목 ID와 함께 저장하며 명칭이나 코드 앞자리로 추정하지 않습니다. */
public enum IncomeGroup {
	ASSET, LIABILITY, OPERATING_REVENUE, OPERATING_EXPENSE, OTHER_REVENUE, OTHER_EXPENSE;

	/** 코드 범위는 유형의 무결성을 검사하며 업무 분개는 계정 ID·역할로 연결합니다. */
	public boolean acceptsCode(String code) {
		if (code == null || !code.matches("[12489][0-9]{2}"))
			return false;
		// 기존 400번대 영업외수익 계정은 과거 ID·이력을 유지하며 신규 기본 기타 입금은 901을 사용합니다.
		if (this == OTHER_REVENUE)
			return code.charAt(0) == '4' || code.charAt(0) == '9';
		return code.charAt(0) == switch (this) {
			case ASSET -> '1';
			case LIABILITY -> '2';
			case OPERATING_REVENUE, OTHER_REVENUE -> '4';
			case OPERATING_EXPENSE, OTHER_EXPENSE -> '8';
		};
	}

	public boolean isExpense() {
		return this == OPERATING_EXPENSE || this == OTHER_EXPENSE;
	}
}
