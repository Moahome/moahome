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
    public record InputRow(int rowNumber, String building, String unitNumber, String name, String relation, String phone, boolean invalidCell) {
        @Override public String toString() { return "InputRow[REDACTED]"; }
    }

    /** 첫 시트의 지정 헤더와 최대 1,000행을 읽으며 수식·오류 셀은 실행하지 않고 행 오류로 전달합니다. */
    public List<InputRow> read(MultipartFile file) {
        if (file == null || file.isEmpty() || file.getSize() > 5 * 1024 * 1024
            || file.getOriginalFilename() == null || !file.getOriginalFilename().toLowerCase(Locale.ROOT).endsWith(".xlsx")) {
            throw new ResidentImportException("INVALID_EXCEL_FILE");
        }
        try {
            byte[] bytes = file.getBytes();
            checkArchive(bytes);
            try (var workbook = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
                if (workbook.getNumberOfSheets() == 0) throw new ResidentImportException("INVALID_EXCEL_FILE");
                Sheet sheet = workbook.getSheetAt(0);
                if (sheet.getLastRowNum() > 1000) throw new ResidentImportException("EXCEL_ROW_LIMIT");
                var formatter = new DataFormatter(Locale.KOREA);
                Row header = sheet.getRow(0);
                String[] expected = {"동", "호수", "이름", "주민 구분", "연락처"};
                if (header == null || header.getLastCellNum() != 5) throw new ResidentImportException("INVALID_EXCEL_HEADER");
                for (int index = 0; index < expected.length; index++) {
                    Cell cell = header.getCell(index);
                    String label = cell == null ? "" : formatter.formatCellValue(cell).strip();
                    // 이미 내려받은 기존 파일은 '관계' 헤더도 허용해 화면 명칭 변경으로 업로드가 중단되지 않게 합니다.
                    boolean matches = expected[index].equals(label) || (index == 3 && "관계".equals(label));
                    if (cell == null || cell.getCellType() == CellType.FORMULA || !matches) {
                        throw new ResidentImportException("INVALID_EXCEL_HEADER");
                    }
                }
                List<InputRow> result = new ArrayList<>();
                for (int index = 1; index <= sheet.getLastRowNum(); index++) {
                    Row row = sheet.getRow(index);
                    if (row == null) continue;
                    String[] values = new String[5];
                    boolean invalid = false;
                    for (int column = 0; column < values.length; column++) {
                        Cell cell = row.getCell(column);
                        boolean unsupported = cell != null && !Set.of(CellType.STRING, CellType.NUMERIC, CellType.BLANK).contains(cell.getCellType());
                        invalid |= unsupported;
                        values[column] = unsupported ? "" : formatter.formatCellValue(cell).strip();
                    }
                    if (!invalid && Arrays.stream(values).allMatch(String::isEmpty)) continue;
                    result.add(new InputRow(index + 1, values[0], values[1], values[2], values[3], values[4], invalid));
                }
                if (result.isEmpty()) throw new ResidentImportException("EMPTY_EXCEL_FILE");
                return List.copyOf(result);
            }
        } catch (ResidentImportException exception) { throw exception; }
        catch (Exception exception) { throw new ResidentImportException("INVALID_EXCEL_FILE"); }
    }

    /** 압축 크기만 작은 거대 XML·다량 항목을 전체 통합 문서로 읽기 전에 제한합니다. */
    private void checkArchive(byte[] bytes) throws IOException {
        try (var zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            int entries = 0;
            long expanded = 0;
            byte[] buffer = new byte[8192];
            while (zip.getNextEntry() != null) {
                if (++entries > 200) throw new ResidentImportException("INVALID_EXCEL_FILE");
                int size;
                while ((size = zip.read(buffer)) != -1) {
                    expanded += size;
                    if (expanded > 20 * 1024 * 1024) throw new ResidentImportException("INVALID_EXCEL_FILE");
                }
            }
            if (entries == 0) throw new ResidentImportException("INVALID_EXCEL_FILE");
        }
    }
}
