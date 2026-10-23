package com.moahome.server.banking.service;

import java.util.*;
import com.moahome.server.payment.exception.PaymentException;
import com.moahome.server.banking.dto.BankingResponse.ImportSupport;

/** 은행별 열 매핑과 공통 Excel 지원 범위를 화면 안내와 서버 검증에서 함께 사용합니다. */
public enum BankImportFormat {
	KB("004", false, "거래일시", "보낸분/받는분", "입금액(원)", "출금액(원)", "잔액(원)",
	    List.of("내통장표시", "적요", "메모")),
	IBK("003", false, "거래일시", "상대계좌예금주명", "입금", "출금", "거래후잔액",
	    List.of("거래내용", "내용", "메모", "거래구분")),
	NH("011", false, "거래일자", "거래기록사항", "입금금액(원)", "출금금액(원)", "거래후잔액(원)",
	    List.of("거래내용", "이체메모", "거래메모")),
	SUHYUP("007", false, "일자", "보낸분/받는분", "입금", "출금", "잔액", List.of("입출금은행", "회차/방법")),
	WOORI("020", false, "거래일시", "기재내용", "입금(원)", "지급(원)", "거래후잔액(원)",
	    List.of("적요", "메모")),
	SHINHAN("088", false, "거래일시", "내용", "입금액", "출금액", "잔액", List.of("적요", "메모")),
	HANA("081", true, "거래일시", "적요", "입금액", "출금액", "잔액", List.of("적요", "메모")),
	KAKAO("090", true, "거래일시", "내용", "거래금액", null, "거래후잔액",
	    List.of("거래구분", "메모"));

	private final String bankCode;
	private final List<String> extensions;
	final String date;
	final String payer;
	final String income;
	final String expense;
	final String balance;
	final List<String> memos;

	BankImportFormat(String bankCode, boolean csvSupported, String date, String payer, String income,
	    String expense, String balance, List<String> memos) {
		this.bankCode = bankCode;
		// Excel 컨테이너는 은행과 무관하게 모두 지원하고 CSV만 기존 은행별 호환 범위를 유지합니다.
		this.extensions = csvSupported ? List.of(".xls", ".xlsx", ".csv") : List.of(".xls", ".xlsx");
		this.date = date;
		this.payer = payer;
		this.income = income;
		this.expense = expense;
		this.balance = balance;
		this.memos = memos;
	}

	/** 목록 밖 코드와 다른 기관 코드를 같은 은행명이라는 이유로 허용하지 않습니다. */
	public static BankImportFormat require(String code) {
		return Arrays.stream(values()).filter(format -> format.bankCode.equals(code)).findFirst()
		    .orElseThrow(() -> new PaymentException("BANK_IMPORT_UNSUPPORTED"));
	}

	public static ImportSupport support(String code) {
		return Arrays.stream(values()).filter(format -> format.bankCode.equals(code)).findFirst()
		    .map(format -> new ImportSupport(true, format.extensions, "지원 형식: " + String.join(" · ", format.extensions)))
		    .orElseGet(() -> new ImportSupport(false, List.of(), "이 은행의 거래내역 업로드는 아직 지원하지 않습니다."));
	}

	/** 지원 Excel 확장자와 기존 CSV 호환 범위를 검사하며 실제 파일 내용은 Reader에서 별도로 검증합니다. */
	void validateFilename(String filename) {
		if (filename == null || extensions.stream().noneMatch(filename.toLowerCase(Locale.ROOT)::endsWith))
			throw new PaymentException("INVALID_BANK_FILE");
	}
}
