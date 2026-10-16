package com.moahome.server.banking.service;
import java.io.*;
import org.junit.jupiter.api.Test;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.mock.web.MockMultipartFile;
import com.moahome.server.payment.exception.PaymentException;
import static org.assertj.core.api.Assertions.*;
class BankTransactionReaderTest {
    final BankTransactionReader reader=new BankTransactionReader();
    @Test void quotedCsvKeepsMemoAndRejectsInvalidDateOrAmount() {
        var rows=reader.read(csv("입금일,입금자명,입금액,적요\n2026-10-15,김대표,\"50,000\",\"메모, 줄바꿈\n유지\""));
        assertThat(rows.getFirst().amount()).isEqualByComparingTo("50000");assertThat(rows.getFirst().memo()).contains("\n");
        for(String row:java.util.List.of("2026-02-30,김대표,50000","2026-10-15,김대표,1.5","2026-10-15,김대표,-1"))
            assertThatThrownBy(()->reader.read(csv("입금일,입금자명,입금액\n"+row))).isInstanceOf(PaymentException.class);
    }
    @Test void xlsxUsesFirstSheetAndRejectsFormulaCells() throws Exception {
        try(var workbook=new XSSFWorkbook();var bytes=new ByteArrayOutputStream()) {
            var sheet=workbook.createSheet("거래");var header=sheet.createRow(0);
            for(int i=0;i<3;i++) header.createCell(i).setCellValue(java.util.List.of("입금일","입금자명","입금액").get(i));
            var row=sheet.createRow(1);row.createCell(0).setCellValue("2026-10-15");row.createCell(1).setCellValue("김대표");row.createCell(2).setCellValue(50000);
            workbook.write(bytes);
            assertThat(reader.read(new MockMultipartFile("file","거래.xlsx","application/octet-stream",bytes.toByteArray()))).hasSize(1);
            row.getCell(2).setCellFormula("1+1");bytes.reset();workbook.write(bytes);
            assertThatThrownBy(()->reader.read(new MockMultipartFile("file","거래.xlsx","application/octet-stream",bytes.toByteArray()))).isInstanceOf(PaymentException.class);
        }
    }
    MockMultipartFile csv(String text) { return new MockMultipartFile("file","거래.csv","text/csv",text.getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
}
