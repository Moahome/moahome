package com.moahome.server.banking.service;

import java.io.ByteArrayOutputStream;
import java.util.*;
import java.util.stream.Stream;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.mock.web.MockMultipartFile;
import com.moahome.server.payment.exception.PaymentException;
import static org.assertj.core.api.Assertions.*;

class BankImportFormatReaderTest {
	private final BankTransactionReader reader = new BankTransactionReader();

	private record Sample(String code, String name, List<String> headers, List<String> values) {
	}

	static Stream<Sample> samples() {
		return Stream.of(
		    sample("004", "은행.xls", "No|거래일시|보낸분/받는분|출금액(원)|입금액(원)|잔액(원)|내 통장 표시|메모|적요", "1|2026.10.15 09:12:34|검증상대|0|50000|150000|표시 내용|메모 내용|거래종류"),
		    sample("003", "은행.xls", "No|거래일시|출금|입금|거래후 잔액|거래내용|상대계좌번호|메모|내용|거래구분|수표어음금액|CMS코드|상대계좌예금주명", "1|2026-10-15 09:12:34|0|50000|150000|거래종류||메모 내용|표시 내용|이체|0||검증상대"),
		    sample("011", "은행.xls", "구분|거래일자|출금금액(원)|입금금액(원)|거래 후 잔액(원)|거래내용|거래기록사항|거래점|거래시간|이체메모|거래메모", "1|2026/10/15|0|50000|150000|거래종류|검증상대|검증점|09:12:34|이체 내용|거래 메모"),
		    sample("007", "은행.xls", "일자|보낸분/받는분||입금|출금||잔액|입출금은행||회차/방법", "2026-10-15\n09:12:34|검증상대||50000|||150000|검증은행||이체"),
		    sample("020", "은행.xlsx", "No.|거래일시|적요|기재내용|지급(원)|입금(원)|거래후 잔액(원)|취급점|메모", "1|2026.10.15 09:12:34|거래종류|검증상대|0|50000|150000|검증점|메모 내용"),
		    sample("088", "은행.xlsx", "No|전체선택|거래일시|적요|입금액|출금액|내용|잔액|거래점명|입금인코드|메모|메모", "1||2026.10.15 09:12:34|거래종류|50000|0|검증상대|150000|검증점||첫 메모|둘째 메모"),
		    sample("081", "은행.xls", "거래일시|구분|적요|출금액|입금액|잔액|거래점", "2026-10-15 09:12:34|이체|검증상대|0|50000|150000|검증점"),
		    sample("090", "은행.xlsx", "거래일시|구분|거래금액|거래 후 잔액|거래구분|내용|메모", "2026.10.15 09:12:34|입금|50000|150000|거래종류|검증상대|메모 내용"));
	}

	/** 은행별 샘플 열을 XLS·XLSX 양쪽으로 생성해 제공 파일의 확장자에 지원 범위가 묶이지 않게 합니다. */
	static Stream<Sample> excelSamples() {
		return samples().flatMap(sample -> Stream.of(".xls", ".xlsx")
		    .map(extension -> new Sample(sample.code(), "은행" + extension, sample.headers(), sample.values())));
	}

	private static Sample sample(String code, String name, String headers, String values) {
		return new Sample(code, name, Arrays.asList(headers.split("\\|", -1)), Arrays.asList(values.split("\\|", -1)));
	}

	/** 은행별 양식은 헤더 위치·빈 열·거래 종류에 상관없이 실제 상대와 금액·시간·잔액을 보존합니다. */
	@ParameterizedTest
	@MethodSource("excelSamples")
	void readsSelectedBankAndRejectsOtherBanks(Sample sample) throws Exception {
		assertThat(BankImportFormat.support(sample.code()).extensions()).contains(".xls", ".xlsx");
		var file = file(sample, false, false);
		assertThat(reader.readAll(file, sample.code())).singleElement().satisfies(row -> {
			assertThat(row.payer()).isEqualTo("검증상대");
			assertThat(row.amount()).isEqualByComparingTo("50000");
			assertThat(row.balance()).isEqualByComparingTo("150000");
			assertThat(row.time()).hasToString("09:12:34");
			assertThat(row.autoMatchEligible()).isTrue();
			if (sample.code().equals("088"))
				assertThat(row.memo()).contains("거래종류", "첫 메모", "둘째 메모");
		});
		for (BankImportFormat other : BankImportFormat.values()) {
			if (BankImportFormat.require(sample.code()) == other)
				continue;
			String otherCode = switch (other) {
				case KB -> "004";
				case IBK -> "003";
				case NH -> "011";
				case SUHYUP -> "007";
				case WOORI -> "020";
				case SHINHAN -> "088";
				case HANA -> "081";
				case KAKAO -> "090";
			};
			assertThatThrownBy(() -> reader.readAll(file, otherCode)).isInstanceOf(PaymentException.class);
		}
	}

	/** 두 형식 모두 확장자만 바꾼 파일을 거부해 실제 컨테이너 검증을 유지합니다. */
	@ParameterizedTest
	@MethodSource("excelSamples")
	void rejectsMismatchedExcelContainer(Sample sample) throws Exception {
		var original = file(sample, false, false);
		String renamed = sample.name().endsWith(".xls") ? "은행.xlsx" : "은행.xls";
		var mismatched = new MockMultipartFile("file", renamed, "application/octet-stream", original.getBytes());
		assertThatThrownBy(() -> reader.readAll(mismatched, sample.code()))
		    .isInstanceOf(PaymentException.class).hasMessage("INVALID_BANK_FILE");
	}

	@Test
	void includesNegativeNhWithdrawalWithoutAutomaticHouseholdMatching() throws Exception {
		Sample sample = samples().filter(item -> item.code().equals("011")).findFirst().orElseThrow();
		var row = reader.readAll(file(sample, true, false), "011").getFirst();
		assertThat(row.direction()).isEqualTo("INCOME");
		assertThat(row.amount()).isEqualByComparingTo("50000");
		assertThat(row.memo()).contains("은행 원문 출금금액(원): -50000");
		assertThat(row.autoMatchEligible()).isFalse();
	}

	@Test
	void missingIbkCounterpartyIsPreservedWithoutGuessingAResident() throws Exception {
		Sample sample = samples().filter(item -> item.code().equals("003")).findFirst().orElseThrow();
		var row = reader.readAll(file(sample, false, true), "003").getFirst();
		assertThat(row.payer()).isEqualTo("거래종류");
		assertThat(row.autoMatchEligible()).isFalse();
	}

	@Test
	void unsupportedCodesDoNotFallBackToNameOrGenericHeaders() {
		for (String code : List.of("032", "012", "SAMPLE", "81")) {
			assertThat(BankImportFormat.support(code).enabled()).isFalse();
			assertThatThrownBy(() -> reader.readAll(new MockMultipartFile("file", new byte[] { 1 }), code))
			    .isInstanceOf(PaymentException.class).hasMessage("BANK_IMPORT_UNSUPPORTED");
		}
	}

	private MockMultipartFile file(Sample sample, boolean negative, boolean missingPayer) throws Exception {
		try (Workbook workbook = sample.name().endsWith(".xls") ? new HSSFWorkbook() : new XSSFWorkbook();
		    var bytes = new ByteArrayOutputStream()) {
			var sheet = workbook.createSheet("거래");
			sheet.createRow(0).createCell(0).setCellValue("은행 제목");
			var header = sheet.createRow(10);
			var data = sheet.createRow(11);
			for (int i = 0; i < sample.headers().size(); i++) {
				header.createCell(i).setCellValue(sample.headers().get(i));
				String value = sample.values().get(i);
				if (negative && i == 2)
					value = "-50000";
				if (negative && i == 3)
					value = "0";
				if (missingPayer && i == 12)
					value = "";
				data.createCell(i).setCellValue(value);
			}
			var footer = sheet.createRow(12);
			int date = sample.code().equals("011") ? 1 : sample.headers().indexOf("거래일시");
			if (!sample.code().equals("007"))
				footer.createCell(date).setCellValue(sample.code().equals("020") ? "총 1건" : "합계");
			workbook.write(bytes);
			return new MockMultipartFile("file", sample.name(), "application/octet-stream", bytes.toByteArray());
		}
	}
}
