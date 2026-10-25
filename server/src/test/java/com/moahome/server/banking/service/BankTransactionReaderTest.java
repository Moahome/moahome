package com.moahome.server.banking.service;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import com.moahome.server.payment.exception.PaymentException;

import static org.assertj.core.api.Assertions.*;

class BankTransactionReaderTest {
	final BankTransactionReader reader = new BankTransactionReader();

	@Test
	void quotedCsvKeepsMemoAndRejectsInvalidDateOrAmount() {
		List<BankTransactionReader.Row> rows = reader
		    .read(csv("입금일,입금자명,입금액,적요\n2026-10-15,김대표,\"50,000\",\"메모, 줄바꿈\n유지\""));
		assertThat(rows.getFirst().amount()).isEqualByComparingTo("50000");
		assertThat(rows.getFirst().memo()).contains("\n");
		for (String row : List.of("2026-02-30,김대표,50000", "2026-10-15,김대표,1.5", "2026-10-15,김대표,-1"))
			assertThatThrownBy(() -> reader.read(csv("입금일,입금자명,입금액\n" + row))).isInstanceOf(PaymentException.class);
	}

	@Test
	void xlsxUsesFirstSheetAndRejectsFormulaCells() throws Exception {
		try (var workbook = new XSSFWorkbook(); var bytes = new ByteArrayOutputStream()) {
			var sheet = workbook.createSheet("거래");
			var header = sheet.createRow(0);
			for (int i = 0; i < 3; i++)
				header.createCell(i).setCellValue(List.of("입금일", "입금자명", "입금액").get(i));
			var row = sheet.createRow(1);
			row.createCell(0).setCellValue("2026-10-15");
			row.createCell(1).setCellValue("김대표");
			row.createCell(2).setCellValue(50000);
			workbook.write(bytes);
			assertThat(
			    reader.read(new MockMultipartFile("file", "거래.xlsx", "application/octet-stream", bytes.toByteArray())))
			    .hasSize(1);
			row.getCell(2).setCellFormula("1+1");
			bytes.reset();
			workbook.write(bytes);
			assertThatThrownBy(() -> reader
			    .read(new MockMultipartFile("file", "거래.xlsx", "application/octet-stream", bytes.toByteArray())))
			    .isInstanceOf(PaymentException.class);
		}
	}

	@Test
	void bankXlsFindsSixthRowHeaderAndReadsOnlyFiveDepositsWithOriginalTimeMemoAndBalance() throws Exception {
		try (var workbook = new HSSFWorkbook()) {
			var sheet = workbook.createSheet("거래내역조회");
			sheet.createRow(0).createCell(0).setCellValue("거래내역조회");
			var info = sheet.createRow(2);
			info.createCell(0).setCellValue("계좌번호");
			info.createCell(1).setCellValue("0000000000000000");
			sheet.createRow(3).createCell(0).setCellValue("잔액");
			var header = sheet.createRow(5);
			List<String> labels = List.of("거래일시", "구분", "적요", "출금액", "입금액", "잔액", "거래점");
			for (int i = 0; i < labels.size(); i++)
				header.createCell(i).setCellValue(labels.get(i));
			for (int i = 0; i < 9; i++) {
				var row = sheet.createRow(6 + i);
				row.createCell(0).setCellValue("2026-10-15 09:12:34");
				row.createCell(1).setCellValue("이체");
				row.createCell(2).setCellValue("검증입금" + i);
				row.createCell(3).setCellValue(i % 2 == 0 ? 0 : 20000);
				row.createCell(4).setCellValue(i % 2 == 0 ? 50000 : 0);
				row.createCell(5).setCellValue(100000 + i * 1000);
				row.createCell(6).setCellValue("검증점");
			}
			var footer = sheet.createRow(15);
			footer.createCell(2).setCellValue("합 계");
			footer.createCell(3).setCellValue(80000);
			footer.createCell(4).setCellValue(250000);
			List<BankTransactionReader.Row> rows = reader.read(excel(workbook, "거래내역조회.xls"));
			assertThat(rows).hasSize(5);
			assertThat(rows).extracting(BankTransactionReader.Row::payer).containsExactly("검증입금0", "검증입금2", "검증입금4",
			    "검증입금6", "검증입금8");
			assertThat(rows).allSatisfy(row -> {
				assertThat(row.date()).isEqualTo(LocalDate.of(2026, 10, 15));
				assertThat(row.time()).isEqualTo(LocalTime.of(9, 12, 34));
				assertThat(row.amount()).isEqualByComparingTo("50000");
				assertThat(row.memo()).isEqualTo(row.payer());
			});
			assertThat(rows.getFirst().balance()).isEqualByComparingTo("100000");
			assertThat(rows.getLast().balance()).isEqualByComparingTo("108000");
			sheet.getRow(6).getCell(4).setCellFormula("1+1");
			assertThatThrownBy(() -> reader.read(excel(workbook, "수식.xls"))).isInstanceOf(PaymentException.class);
		}
	}

	@Test
	void bankXlsxAndCsvFindPreambleAndPreferDedicatedPayerOverMemo() throws Exception {
		String source = "거래내역조회\n계좌번호,0000000000000000\n거래일시,적요,입금자명,출금액,입금액,잔액\n2026-10-15 10:11:12,관리비,김대표,0,50000,150000";
		assertThat(reader.read(csv(source)).getFirst().payer()).isEqualTo("김대표");
		try (var workbook = new XSSFWorkbook()) {
			var sheet = workbook.createSheet("거래");
			sheet.createRow(0).createCell(0).setCellValue("거래내역조회");
			List<String> labels = List.of("거래일시", "적요", "출금액", "입금액", "잔액");
			var header = sheet.createRow(5);
			for (int i = 0; i < labels.size(); i++)
				header.createCell(i).setCellValue(labels.get(i));
			var row = sheet.createRow(6);
			row.createCell(0).setCellValue("2026-10-15 10:11:12");
			row.createCell(1).setCellValue("김대표");
			row.createCell(2).setCellValue(0);
			row.createCell(3).setCellValue(50000);
			row.createCell(4).setCellValue(150000);
			assertThat(reader.read(excel(workbook, "은행.xlsx")).getFirst().payer()).isEqualTo("김대표");
			assertThatThrownBy(() -> reader.read(excel(workbook, "확장자만변경.xls"))).isInstanceOf(PaymentException.class);
		}
	}

	@Test
	void rejectsAmbiguousDirectionMissingHeadersAndDisguisedXls() {
		assertThatThrownBy(() -> reader.read(csv("거래일시,적요,출금액,입금액\n2026-10-15,김대표,1000,50000")))
		    .isInstanceOf(PaymentException.class).hasMessage("INVALID_BANK_ROW");
		assertThatThrownBy(() -> reader.read(csv("거래일시,적요,입금액\n2026-10-15,김대표,50000")))
		    .isInstanceOf(PaymentException.class).hasMessage("INVALID_BANK_HEADER");
		assertThatThrownBy(() -> reader
		    .read(new MockMultipartFile("file", "은행.xls", "application/vnd.ms-excel", "<html>은행</html>".getBytes())))
		    .isInstanceOf(PaymentException.class).hasMessage("INVALID_BANK_FILE");
		assertThatThrownBy(() -> reader.read(csv("거래일시,적요,출금액,입금액\n2026-10-15,청소비,50000,0")))
		    .isInstanceOf(PaymentException.class).hasMessage("EMPTY_BANK_FILE");
		assertThatThrownBy(() -> reader.read(csv("거래일시,적요,출금액,입금액\n,김대표,0,50000"))).isInstanceOf(PaymentException.class)
		    .hasMessage("INVALID_BANK_ROW");
	}

	@Test
	void transactionLimitDoesNotCountBankPreambleButStillRejectsMoreThanFiveThousandRows() {
		String header = "거래내역조회\n계좌번호,0000000000000000\n조회기간\n잔액\n거래일시,적요,출금액,입금액\n";
		String source = header + "2026-10-15 09:12:34,김대표,0,50000\n".repeat(5000);
		assertThat(reader.read(csv(source))).hasSize(5000);
		assertThatThrownBy(() -> reader.read(csv(source + "2026-10-15,김대표,0,50000")))
		    .isInstanceOf(PaymentException.class).hasMessage("BANK_ROW_LIMIT");
	}

	/** 카카오의 공용 거래금액·구분·내용 양식을 읽고 출금과 입금을 섞어 수납하지 않습니다. */
	@Test
	void kakaoXlsxReadsFiveDepositsFromEleventhRowHeaderAndPreservesMemoTimeAndBalance() throws Exception {
		try (var workbook = new XSSFWorkbook()) {
			var sheet = workbook.createSheet("거래내역");
			sheet.createRow(0).createCell(1).setCellValue("카카오뱅크 거래내역");
			sheet.createRow(2).createCell(1).setCellValue("계좌 정보");
			var header = sheet.createRow(10);
			List<String> labels = List.of("거래일시", "구분", "거래금액", "거래 후 잔액", "거래구분", "내용", "메모");
			for (int i = 0; i < labels.size(); i++)
				header.createCell(i + 1).setCellValue(labels.get(i));
			for (int i = 0; i < 16; i++) {
				var row = sheet.createRow(11 + i);
				boolean deposit = i < 5;
				row.createCell(1).setCellValue("2026.07.17 17:38:28");
				row.createCell(2).setCellValue(deposit ? "입금" : "출금");
				row.createCell(3).setCellValue(deposit ? 50000 : -20000);
				row.createCell(4).setCellValue(150000 + i * 1000);
				row.createCell(5).setCellValue(deposit ? "일반입금" : "체크카드결제");
				row.createCell(6).setCellValue(deposit ? "103동501" : "검증가맹점");
				row.createCell(7).setCellValue(deposit ? "관리비 메모" : "출금 메모");
			}
			List<BankTransactionReader.Row> rows = reader.read(excel(workbook, "카카오뱅크.xlsx"));
			assertThat(rows).hasSize(5).allSatisfy(row -> {
				assertThat(row.payer()).isEqualTo("103동501");
				assertThat(row.memo()).isEqualTo("관리비 메모");
				assertThat(row.date()).isEqualTo(LocalDate.of(2026, 7, 17));
				assertThat(row.time()).isEqualTo(LocalTime.of(17, 38, 28));
				assertThat(row.amount()).isEqualByComparingTo("50000");
			});
			assertThat(rows.getFirst().balance()).isEqualByComparingTo("150000");
			sheet.getRow(11).getCell(3).setCellFormula("1+1");
			assertThatThrownBy(() -> reader.read(excel(workbook, "카카오수식.xlsx"))).isInstanceOf(PaymentException.class);
		}
	}

	@Test
	void sharedTransactionAmountRequiresDirectionAndRejectsNegativeDepositsOrUnknownDirections() {
		String header = "거래일시,구분,거래금액,거래 후 잔액,거래구분,내용,메모\n";
		for (String transaction : List.of("입금,-50000", "이체,50000", "입금,1.5", "출금,invalid"))
			assertThatThrownBy(
			    () -> reader.read(csv(header + "2026.07.17 17:38:28," + transaction + ",150000,일반입금,103동501,관리비")))
			    .isInstanceOf(PaymentException.class).hasMessage("INVALID_BANK_ROW");
		assertThatThrownBy(() -> reader.read(csv("거래일시,거래금액,내용\n2026-07-17,50000,103동501")))
		    .isInstanceOf(PaymentException.class).hasMessage("INVALID_BANK_HEADER");
		assertThatThrownBy(() -> reader.read(csv(header + "2026-07-17,출금,50000,100000,이체,검증,메모")))
		    .isInstanceOf(PaymentException.class).hasMessage("EMPTY_BANK_FILE");
		assertThat(reader.read(csv(header + "2026-07-17,입금,50000,100000,일반입금,103동501,"))).singleElement()
		    .satisfies(row -> assertThat(row.memo()).isNull());
	}

	MockMultipartFile excel(Workbook workbook, String name) throws IOException {
		var bytes = new ByteArrayOutputStream();
		workbook.write(bytes);
		return new MockMultipartFile("file", name, "application/octet-stream", bytes.toByteArray());
	}

	MockMultipartFile csv(String text) {
		return new MockMultipartFile("file", "거래.csv", "text/csv",
		    text.getBytes(StandardCharsets.UTF_8));
	}
}
