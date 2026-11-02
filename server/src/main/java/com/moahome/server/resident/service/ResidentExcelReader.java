package com.moahome.server.resident.service;

import java.io.*;
import java.util.*;
import java.util.zip.ZipInputStream;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import com.moahome.server.resident.exception.ResidentImportException;

@Component
public class ResidentExcelReader {
	public record InputRow(int rowNumber, String building, String unitNumber, String name, String relation,
	    String phone, boolean invalidCell) {
		@Override
		public String toString() {
			return "InputRow[REDACTED]";
		}
	}

	/** 첫 시트의 지정 헤더와 최대 1,000행을 읽으며 수식·오류 셀은 실행하지 않고 행 오류로 전달합니다. */
	public List<InputRow> read(MultipartFile file) {
		if (file == null || file.isEmpty() || file.getSize() > 5 * 1024 * 1024 || file.getOriginalFilename() == null
		    || !file.getOriginalFilename().toLowerCase(Locale.ROOT).endsWith(".xlsx")) {
			throw new ResidentImportException("INVALID_EXCEL_FILE");
		}
		try {
			byte[] bytes = file.getBytes();
			checkArchive(bytes);
			try (var workbook = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
				if (workbook.getNumberOfSheets() == 0)
					throw new ResidentImportException("INVALID_EXCEL_FILE");
				Sheet sheet = workbook.getSheetAt(0);
				if (sheet.getLastRowNum() > 1000)
					throw new ResidentImportException("EXCEL_ROW_LIMIT");
				var formatter = new DataFormatter(Locale.KOREA);
				ColumnLayout layout = readHeader(sheet.getRow(0), formatter);
				List<InputRow> result = new ArrayList<>();
				for (int index = 1; index <= sheet.getLastRowNum(); index++) {
					Row row = sheet.getRow(index);
					if (row == null)
						continue;
					String[] values = new String[layout.count()];
					boolean invalid = false;
					for (int column = 0; column < values.length; column++) {
						Cell cell = row.getCell(column);
						boolean unsupported = cell != null
						    && !Set.of(CellType.STRING, CellType.NUMERIC, CellType.BLANK).contains(cell.getCellType());
						invalid |= unsupported;
						values[column] = unsupported ? "" : formatter.formatCellValue(cell).strip();
					}
					if (!invalid && Arrays.stream(values).allMatch(string -> string.isEmpty()))
						continue;
					result.add(new InputRow(index + 1, layout.building() < 0 ? "" : values[layout.building()],
					    values[layout.unitNumber()], values[layout.name()], values[layout.relation()],
					    values[layout.phone()], invalid));
				}
				if (result.isEmpty())
					throw new ResidentImportException("EMPTY_EXCEL_FILE");
				return List.copyOf(result);
			}
		} catch (ResidentImportException exception) {
			throw exception;
		} catch (Exception exception) {
			throw new ResidentImportException("INVALID_EXCEL_FILE");
		}
	}

	private record ColumnLayout(int building, int unitNumber, int name, int relation, int phone, int count) {
	}

	/** 현재 동별·동 없는 양식과 기존 배포 양식만 허용하고 전화번호·주민 구분의 위치를 명시적으로 연결합니다. */
	private ColumnLayout readHeader(Row header, DataFormatter formatter) {
		if (header == null || (header.getLastCellNum() != 4 && header.getLastCellNum() != 5))
			throw new ResidentImportException("INVALID_EXCEL_HEADER");
		List<String> labels = new ArrayList<>();
		for (int index = 0; index < header.getLastCellNum(); index++) {
			Cell cell = header.getCell(index);
			if (cell == null || cell.getCellType() != CellType.STRING)
				throw new ResidentImportException("INVALID_EXCEL_HEADER");
			labels.add(formatter.formatCellValue(cell).strip());
		}
		if (labels.equals(List.of("동", "호수", "이름", "연락처", "주민 구분")))
			return new ColumnLayout(0, 1, 2, 4, 3, 5);
		if (labels.equals(List.of("호수", "이름", "연락처", "주민 구분")))
			return new ColumnLayout(-1, 0, 1, 3, 2, 4);
		// 이미 내려받은 다섯 열 양식은 예전 순서와 '관계' 이름을 함께 지원합니다.
		if (labels.equals(List.of("동", "호수", "이름", "주민 구분", "연락처"))
		    || labels.equals(List.of("동", "호수", "이름", "관계", "연락처")))
			return new ColumnLayout(0, 1, 2, 3, 4, 5);
		throw new ResidentImportException("INVALID_EXCEL_HEADER");
	}

	/** 압축 크기만 작은 거대 XML·다량 항목을 전체 통합 문서로 읽기 전에 제한합니다. */
	private void checkArchive(byte[] bytes) throws IOException {
		try (var zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
			int entries = 0;
			long expanded = 0;
			byte[] buffer = new byte[8192];
			while (zip.getNextEntry() != null) {
				if (++entries > 200)
					throw new ResidentImportException("INVALID_EXCEL_FILE");
				int size;
				while ((size = zip.read(buffer)) != -1) {
					expanded += size;
					if (expanded > 20 * 1024 * 1024)
						throw new ResidentImportException("INVALID_EXCEL_FILE");
				}
			}
			if (entries == 0)
				throw new ResidentImportException("INVALID_EXCEL_FILE");
		}
	}
}
