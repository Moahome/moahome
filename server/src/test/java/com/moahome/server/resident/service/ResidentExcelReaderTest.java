package com.moahome.server.resident.service;

import java.io.*;
import java.nio.file.*;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import com.moahome.server.resident.exception.ResidentImportException;

import static org.assertj.core.api.Assertions.*;

class ResidentExcelReaderTest {
	private final ResidentExcelReader reader = new ResidentExcelReader();

	@Test
	void readsTextWithLeadingZerosAndMarksFormulaWithoutEvaluatingIt() throws Exception {
		try (var workbook = workbook()) {
			var sheet = workbook.getSheetAt(0);
			var row = sheet.createRow(1);
			String[] data = { "102동", "001", "주민", "가족", "01012345678" };
			for (int col = 0; col < 5; col++)
				row.createCell(col).setCellValue(data[col]);
			sheet.createRow(2); // 빈 행은 주민으로 집계하지 않습니다.
			sheet.createRow(3).createCell(2).setCellFormula("1+1");
			List<ResidentExcelReader.InputRow> rows = reader.read(file(workbook));
			assertThat(rows).hasSize(2);
			assertThat(rows.getFirst().phone()).isEqualTo("01012345678");
			assertThat(rows.getFirst().unitNumber()).isEqualTo("001");
			assertThat(rows.get(1).rowNumber()).isEqualTo(4);
			assertThat(rows.get(1).invalidCell()).isTrue();
			assertThat(rows.get(1).name()).isEmpty();
		}
	}

	@Test
	void downloadableTemplateIsReadableAndKeepsPhoneAndUnitTextFormat() throws Exception {
		var path = Path.of("../client/public/residentImportTemplate.xlsx");
		try (var workbook = new XSSFWorkbook(Files.newInputStream(path))) {
			var sheet = workbook.getSheetAt(0);
			assertThat(sheet.getRow(0).getCell(4).getStringCellValue()).isEqualTo("연락처");
			assertThat(sheet.getColumnStyle(1).getDataFormatString()).isEqualTo("@");
			assertThat(sheet.getColumnStyle(4).getDataFormatString()).isEqualTo("@");
			var row = sheet.createRow(1);
			String[] data = { "", "301", "양식 테스트", "가족", "" };
			for (int col = 0; col < 5; col++)
				row.createCell(col).setCellValue(data[col]);
			assertThat(reader.read(file(workbook))).hasSize(1);
		}
	}

	@Test
	void rejectsBadHeaderEmptyFileWrongExtensionAndTooManyRows() throws Exception {
		try (var workbook = workbook()) {
			assertCode(file(workbook), "EMPTY_EXCEL_FILE");
			workbook.getSheetAt(0).getRow(0).getCell(2).setCellValue("주민명");
			assertCode(file(workbook), "INVALID_EXCEL_HEADER");
		}
		try (var workbook = workbook()) {
			workbook.getSheetAt(0).createRow(1001).createCell(2).setCellValue("초과");
			assertCode(file(workbook), "EXCEL_ROW_LIMIT");
		}
		assertCode(new MockMultipartFile("file", "file.xls", "", new byte[] { 1 }), "INVALID_EXCEL_FILE");
		assertCode(new MockMultipartFile("file", "file.xlsx", "", new byte[] { 1, 2, 3 }), "INVALID_EXCEL_FILE");
		assertCode(new MockMultipartFile("file", "file.xlsx", "", new byte[5 * 1024 * 1024 + 1]), "INVALID_EXCEL_FILE");
	}

	@Test
	void rejectsOversizedExpandedArchiveBeforeParsingWorkbook() throws Exception {
		try (var bytes = new ByteArrayOutputStream(); var zip = new ZipOutputStream(bytes)) {
			zip.putNextEntry(new ZipEntry("large.xml"));
			zip.write(new byte[21 * 1024 * 1024]);
			zip.closeEntry();
			zip.finish();
			assertCode(new MockMultipartFile("file", "file.xlsx", "", bytes.toByteArray()), "INVALID_EXCEL_FILE");
		}
	}

	private void assertCode(MockMultipartFile file, String code) {
		assertThatThrownBy(() -> reader.read(file)).isInstanceOf(ResidentImportException.class).hasMessage(code);
	}

	private XSSFWorkbook workbook() {
		var workbook = new XSSFWorkbook();
		var header = workbook.createSheet().createRow(0);
		String[] labels = { "동", "호수", "이름", "관계", "연락처" };
		for (int index = 0; index < 5; index++)
			header.createCell(index).setCellValue(labels[index]);
		return workbook;
	}

	private MockMultipartFile file(XSSFWorkbook workbook) throws Exception {
		var bytes = new ByteArrayOutputStream();
		workbook.write(bytes);
		return new MockMultipartFile("file", "residents.xlsx",
		    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes.toByteArray());
	}
}
