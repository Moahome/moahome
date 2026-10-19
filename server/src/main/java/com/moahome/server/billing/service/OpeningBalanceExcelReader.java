package com.moahome.server.billing.service;

import java.util.*;
import com.moahome.server.billing.dto.OpeningBalanceRequest;
import com.moahome.server.payment.exception.PaymentException;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class OpeningBalanceExcelReader {
	/** 세대 ID는 내려받은 양식의 불변 식별자이며 호수·이름 추측 없이 기존 세대와 직접 대조합니다. 수식은 실행하지 않습니다. */
	public List<OpeningBalanceRequest.UnitInput> read(MultipartFile file) {
		if (file == null || file.isEmpty() || file.getSize() > 5 * 1024 * 1024 || file.getOriginalFilename() == null
		    || !file.getOriginalFilename().toLowerCase(Locale.ROOT).endsWith(".xlsx"))
			throw new PaymentException("INVALID_OPENING_FILE");
		try (var input = file.getInputStream(); var book = new XSSFWorkbook(input)) {
			if (book.getNumberOfSheets() == 0)
				throw new IllegalArgumentException();
			var sheet = book.getSheetAt(0);
			var header = sheet.getRow(0);
			List<String> expected = List.of("세대 ID", "세대", "기존 미납", "기존 선납", "발생월", "부담 주체 메모");
			for (int i = 0; i < expected.size(); i++)
				if (header == null || !expected.get(i).equals(text(header.getCell(i))))
					throw new IllegalArgumentException();
			if (sheet.getLastRowNum() > 10000)
				throw new IllegalArgumentException();
			List<OpeningBalanceRequest.UnitInput> rows = new ArrayList<>();
			Set<UUID> seen = new HashSet<>();
			for (int i = 1; i <= sheet.getLastRowNum(); i++) {
				var row = sheet.getRow(i);
				if (row == null)
					continue;
				var id = text(row.getCell(0));
				if (id.isBlank()) {
					for (int j = 1; j < expected.size(); j++)
						if (!text(row.getCell(j)).isBlank())
							throw new IllegalArgumentException();
					continue;
				}
				if (!id.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"))
					throw new IllegalArgumentException();
				var unit = UUID.fromString(id);
				if (!seen.add(unit))
					throw new IllegalArgumentException();
				var receivable = text(row.getCell(2));
				var credit = text(row.getCell(3));
				if (!receivable.matches("[0-9]{1,15}") || !credit.matches("[0-9]{1,15}"))
					throw new IllegalArgumentException();
				var origin = text(row.getCell(4));
				if (!origin.isBlank())
					com.moahome.server.billing.domain.BillingCalendar.parseMonth(origin);
				var note = text(row.getCell(5));
				if (note.length() > 500)
					throw new IllegalArgumentException();
				rows.add(new OpeningBalanceRequest.UnitInput(unit, receivable, credit, origin.isBlank() ? null : origin,
				    note.isBlank() ? null : note));
			}
			if (rows.isEmpty())
				throw new IllegalArgumentException();
			return rows;
		} catch (Exception failure) {
			throw new PaymentException("INVALID_OPENING_FILE");
		}
	}

	private String text(Cell cell) {
		if (cell == null || cell.getCellType() == CellType.BLANK)
			return "";
		if (cell.getCellType() == CellType.STRING)
			return cell.getStringCellValue().strip();
		if (cell.getCellType() == CellType.NUMERIC) {
			var amount = java.math.BigDecimal.valueOf(cell.getNumericCellValue()).stripTrailingZeros();
			if (amount.scale() > 0)
				throw new IllegalArgumentException();
			return amount.toPlainString();
		}
		throw new IllegalArgumentException("Formulas and errors are not supported");
	}
}
