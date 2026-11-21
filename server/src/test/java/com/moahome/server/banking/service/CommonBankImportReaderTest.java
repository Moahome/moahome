package com.moahome.server.banking.service;

import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import static org.assertj.core.api.Assertions.*;

class CommonBankImportReaderTest {

	private final BankTransactionReader reader = new BankTransactionReader();

	/** 미지원 은행만 공통 양식으로 읽으며 선택 시간·잔액·메모를 보존합니다. */
	@Test
	void readsCommonTemplateOnlyForUnsupportedBank() throws Exception {
		var file = file(List.of(
		    List.of("2026-10-15", "09:12:34", "검증입금", "50000", "", "150000", "원본 메모"),
		    List.of("2026-10-16", "", "검증출금", "", "32000", "", "")), false);
		var rows = reader.readForBanking(file, "032");
		assertThat(rows).hasSize(2);
		assertThat(rows.getFirst().direction()).isEqualTo("INCOME");
		assertThat(rows.getFirst().time()).hasToString("09:12:34");
		assertThat(rows.getFirst().balance()).isEqualByComparingTo("150000");
		assertThat(rows.getFirst().memo()).isEqualTo("원본 메모");
		assertThat(rows.getLast().direction()).isEqualTo("EXPENSE");
		assertThat(rows.getLast().amount()).isEqualByComparingTo("32000");
		assertThat(rows.getLast().time()).isNull();
		assertThat(rows.getLast().balance()).isNull();
		assertThatThrownBy(() -> reader.readAll(file, "032")).hasMessage("BANK_IMPORT_UNSUPPORTED");
		assertThatThrownBy(() -> reader.readForBanking(file, "090")).hasMessage("INVALID_BANK_HEADER");
		assertThat(BankImportFormat.support("COMMON").enabled()).isFalse();
	}

	/** 입출금 동시 기입·수식·빈 양식은 저장 대상으로 해석하지 않습니다. */
	@Test
	void rejectsAmbiguousAmountsFormulaAndEmptyWorkbook() throws Exception {
		assertThatThrownBy(() -> reader.readForBanking(file(List.of(
		    List.of("2026-10-15", "", "검증거래", "100", "100", "0", "")), false), "032"))
		    .hasMessage("INVALID_BANK_ROW");
		assertThatThrownBy(() -> reader.readForBanking(file(List.of(
		    List.of("2026-10-15", "", "검증거래", "100", "", "0", "")), true), "032"))
		    .hasMessage("INVALID_BANK_ROW");
		assertThatThrownBy(() -> reader.readForBanking(file(List.of(), false), "032"))
		    .hasMessage("EMPTY_BANK_FILE");
	}

	private MockMultipartFile file(List<List<String>> rows, boolean formula) throws Exception {
		try (var workbook = new XSSFWorkbook(); var bytes = new ByteArrayOutputStream()) {
			var sheet = workbook.createSheet("은행거래_업로드");
			List<List<String>> content = new ArrayList<>();
			content.add(List.of("거래일", "거래시간", "입금자·거래내용", "입금액", "출금액", "거래 후 잔액", "메모"));
			content.addAll(rows);
			for (int index = 0; index < content.size(); index++) {
				var row = sheet.createRow(index);
				for (int column = 0; column < content.get(index).size(); column++)
					row.createCell(column).setCellValue(content.get(index).get(column));
			}
			// 날짜만 입력한 Excel 날짜 셀은 별도 거래시간이 없을 때 자정을 만들어내지 않아야 합니다.
			var dateStyle = workbook.createCellStyle();
			dateStyle.setDataFormat(workbook.createDataFormat().getFormat("yyyy-mm-dd"));
			for (int index = 1; index < content.size(); index++) {
				var dateCell = sheet.getRow(index).getCell(0);
				dateCell.setCellValue(LocalDate.parse(content.get(index).getFirst()));
				dateCell.setCellStyle(dateStyle);
			}
			if (formula)
				sheet.getRow(1).getCell(3).setCellFormula("50+50");
			workbook.write(bytes);
			return new MockMultipartFile("file", "공통양식.xlsx", "application/octet-stream", bytes.toByteArray());
		}
	}
}
