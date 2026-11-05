package com.moahome.server.accounting.domain;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/** 사용자가 지정한 기본 계정 코드·명칭을 제공하며 관리대상별로 독립된 계정 ID를 생성합니다. */
public enum DefaultAccount {
	BANK("101", "통장", IncomeGroup.ASSET, "BANK"),
	RECEIVABLE("102", "미수금", IncomeGroup.ASSET, "RECEIVABLE"),
	ADVANCE_RECEIPT("201", "선수금", IncomeGroup.LIABILITY, "ADVANCE_RECEIPT"),
	PAYABLE("202", "미지급금", IncomeGroup.LIABILITY, "PAYABLE"),
	MANAGEMENT_REVENUE("401", "관리비수입", IncomeGroup.OPERATING_REVENUE, "MANAGEMENT_REVENUE"),
	OTHER_INCOME("901", "영업외수익", IncomeGroup.OTHER_REVENUE, "OTHER_INCOME"),
	GENERAL_MANAGEMENT("801", "일반관리비", IncomeGroup.OPERATING_EXPENSE, null),
	CLEANING("802", "청소비", IncomeGroup.OPERATING_EXPENSE, null),
	ELEVATOR("803", "엘리베이터비", IncomeGroup.OPERATING_EXPENSE, null),
	UTILITIES("804", "수도전기료", IncomeGroup.OPERATING_EXPENSE, null),
	MOAHOME("805", "모아홈비", IncomeGroup.OPERATING_EXPENSE, null),
	REPAIR("806", "수선비", IncomeGroup.OPERATING_EXPENSE, null),
	SEPTIC("807", "정화조비", IncomeGroup.OPERATING_EXPENSE, null),
	COMMUNICATION("808", "통신비", IncomeGroup.OPERATING_EXPENSE, null),
	COMMISSION("809", "지급수수료", IncomeGroup.OPERATING_EXPENSE, null),
	SUPPLIES("810", "소모품", IncomeGroup.OPERATING_EXPENSE, null),
	INSURANCE("812", "보험료", IncomeGroup.OPERATING_EXPENSE, null),
	MISCELLANEOUS("813", "잡비", IncomeGroup.OPERATING_EXPENSE, null);

	private final String code;
	private final String name;
	private final IncomeGroup group;
	private final String systemKey;

	DefaultAccount(String code, String name, IncomeGroup group, String systemKey) {
		this.code = code;
		this.name = name;
		this.group = group;
		this.systemKey = systemKey;
	}

	/** 기존 지출의 기본 과목명·통상 표기를 코드에 매칭하며 둘 이상의 과목이면 임의 선택하지 않습니다. */
	public static Optional<DefaultAccount> matchExpense(String category) {
		if (category == null || category.isBlank())
			return Optional.empty();
		String text = category.replaceAll("(?U)\\s+", "");
		// 직접 입력한 세 자리 코드는 명칭보다 우선하고 해당 비용 계정의 존재는 관리대상에서 다시 확인합니다.
		String code = category.strip().split("[\\s·:.-]", 2)[0];
		// 기존 원천에 남은 잡비 코드 표기도 새 813 계정으로 이어 원본 문자열을 고치지 않습니다.
		if ("811".equals(code))
			return Optional.of(MISCELLANEOUS);
		Optional<DefaultAccount> explicit = Arrays.stream(values())
			.filter(value -> value.group.isExpense() && value.code.equals(code)).findFirst();
		if (explicit.isPresent())
			return explicit;
		List<DefaultAccount> matches = Arrays.stream(values()).filter(value -> value.group.isExpense())
			.filter(value -> value.aliases().stream().anyMatch(text::contains)).toList();
		return matches.size() == 1 ? Optional.of(matches.getFirst()) : Optional.empty();
	}

	/** 기본 코드의 통상 명칭만 공유하며 거래처 이름이나 금액으로 과목을 추정하지 않습니다. */
	private List<String> aliases() {
		return switch (this) {
			case ELEVATOR -> List.of(name, "엘리베이터", "승강기유지비", "승강기유지보수비");
			case UTILITIES -> List.of(name, "전기료", "전기요금", "수도료", "수도요금");
			case SEPTIC -> List.of(name, "정화조");
			case COMMUNICATION -> List.of(name, "전화요금", "인터넷요금", "문자수수료");
			case SUPPLIES -> List.of(name, "소모품비");
			default -> List.of(name);
		};
	}

	public String getCode() {
		return code;
	}

	public String getName() {
		return name;
	}

	public IncomeGroup getGroup() {
		return group;
	}

	public String getSystemKey() {
		return systemKey;
	}
}
