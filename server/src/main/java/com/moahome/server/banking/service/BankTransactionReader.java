package com.moahome.server.banking.service;

import java.io.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.zip.ZipInputStream;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.poifs.filesystem.FileMagic;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import com.moahome.server.payment.exception.PaymentException;

@Component
public class BankTransactionReader {
    private static final int MAX_HEADER_ROWS = 20;
    private static final int MAX_TRANSACTION_ROWS = 5000;
    private static final List<String> DATE_HEADERS = List.of("입금일","거래일","거래일자","거래일시","일자","date");
    private static final List<String> PAYER_HEADERS = List.of("입금자명","입금자","보낸분","보내신분","거래자명","payer");
    private static final List<String> AMOUNT_HEADERS = List.of("입금액","입금금액","입금","amount");
    private static final List<String> WITHDRAWAL_HEADERS = List.of("출금액","출금금액","출금");
    private record Columns(int header,int date,int payer,int amount,int withdrawal,int memo,int reference,int time,int balance,int direction,boolean sharedAmount) {}
    public record Row(LocalDate date,String payer,BigDecimal amount,String memo,String reference,LocalTime time,BigDecimal balance) {
        @Override public String toString() { return "BankRow[REDACTED]"; }
    }
    /** 파일은 서버에서도 크기·확장·압축·수식·필수 열을 검사하며 검증 전 원장을 변경하지 않습니다. */
    public List<Row> read(MultipartFile file) {
        if (file==null || file.isEmpty() || file.getSize()>5*1024*1024 || file.getOriginalFilename()==null)
            throw new PaymentException("INVALID_BANK_FILE");
        try {
            byte[] bytes=file.getBytes();
            String name=file.getOriginalFilename().toLowerCase(Locale.ROOT);
            List<List<String>> rows;
            if (name.endsWith(".xlsx") || name.endsWith(".xls")) rows=excel(bytes,name.endsWith(".xls"));
            else if (name.endsWith(".csv")) rows=csv(StandardCharsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString());
            else throw new PaymentException("INVALID_BANK_FILE");
            var columns=findColumns(rows);
            var transactions=rows.subList(columns.header()+1,rows.size());
            if (transactions.size()>MAX_TRANSACTION_ROWS) throw new PaymentException("BANK_ROW_LIMIT");
            List<Row> result=new ArrayList<>();
            for (var row: transactions) {
                if (isSummaryRow(row,columns)) continue;
                String raw=cell(row,columns.amount()).replace(",","").replace("원","").strip();
                if (raw.isEmpty() || raw.matches("0+")) continue; // 은행 파일의 출금 행은 입금 수납 후보에서 제외합니다.
                // 카카오 양식은 공용 거래금액의 부호만 추측하지 않고 명시된 입금·출금 구분으로 처리합니다.
                if (columns.sharedAmount()) {
                    String direction=cell(row,columns.direction()).strip();
                    if (!List.of("입금","출금").contains(direction)||!raw.matches("-?[0-9]{1,15}"))
                        throw new PaymentException("INVALID_BANK_ROW");
                    if ("출금".equals(direction)) continue;
                }
                if (!raw.matches("[0-9]{1,15}")) throw new PaymentException("INVALID_BANK_ROW");
                BigDecimal value=new BigDecimal(raw);
                if (value.signum()<=0) throw new PaymentException("INVALID_BANK_ROW");
                // 입출금이 동시에 양수인 행은 거래 방향을 임의로 선택하지 않습니다.
                String withdrawal=cell(row,columns.withdrawal()).replace(",","").replace("원","").strip();
                if (!withdrawal.isEmpty() && !withdrawal.matches("0+")) throw new PaymentException("INVALID_BANK_ROW");
                String depositor=cell(row,columns.payer()).strip();
                String text=cell(row,columns.memo()).strip(), reference=cell(row,columns.reference()).strip();
                if (depositor.isBlank() || depositor.length()>100 || text.length()>500 || reference.length()>200)
                    throw new PaymentException("INVALID_BANK_ROW");
                String rawDate=cell(row,columns.date()).strip().replace('.', '-').replace('/', '-');
                LocalDate day;
                if (rawDate.matches("[0-9]{8}")) day=LocalDate.parse(rawDate,java.time.format.DateTimeFormatter.BASIC_ISO_DATE);
                else if (rawDate.matches("[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}.*")) {
                    String[] pieces=rawDate.split("[ T]")[0].split("-");
                    day=LocalDate.of(Integer.parseInt(pieces[0]),Integer.parseInt(pieces[1]),Integer.parseInt(pieces[2]));
                } else if (rawDate.matches("[0-9]{1,6}(\\.[0-9]+)?")) day=DateUtil.getLocalDateTime(Double.parseDouble(rawDate)).toLocalDate();
                else throw new PaymentException("INVALID_BANK_ROW");
                if (day.getYear()<1000 || day.getYear()>9999) throw new PaymentException("INVALID_BANK_ROW");
                String timeValue=cell(row,columns.time()).strip();
                if (timeValue.isEmpty() && rawDate.split("[ T]").length>1) timeValue=rawDate.split("[ T]")[1];
                if (timeValue.contains("T")) timeValue=timeValue.split("T")[1];
                LocalTime time=timeValue.isEmpty()?null:LocalTime.parse(timeValue);
                String rawBalance=cell(row,columns.balance()).replace(",","").replace("원","").strip();
                if (!rawBalance.isEmpty()&&!rawBalance.matches("-?[0-9]{1,15}")) throw new PaymentException("INVALID_BANK_ROW");
                BigDecimal balance=rawBalance.isEmpty()?null:new BigDecimal(rawBalance);
                result.add(new Row(day,depositor,value,text.isEmpty()?null:text,reference.isEmpty()?null:reference,time,balance));
            }
            if (result.isEmpty()) throw new PaymentException("EMPTY_BANK_FILE");
            return List.copyOf(result);
        } catch (PaymentException exception) { throw exception; }
        catch (Exception exception) { throw new PaymentException("INVALID_BANK_FILE"); }
    }
    /** 은행 하단의 명시적인 합계 행만 제외하고 날짜가 빠진 실제 거래를 임의로 건너뛰지 않습니다. */
    private boolean isSummaryRow(List<String> row,Columns columns) {
        if (columns.withdrawal()<0) return false;
        String date=cell(row,columns.date()).strip().replaceAll("\\s+","");
        String memo=cell(row,columns.memo()).strip().replaceAll("\\s+","");
        var labels=List.of("합계","총합계");
        return labels.contains(date) || (date.isEmpty() && labels.contains(memo));
    }
    /** 은행 제목·계좌 안내를 건너뛰고 필수 열이 함께 있는 거래 머리글을 찾습니다. */
    private Columns findColumns(List<List<String>> rows) {
        for (int index=0;index<Math.min(rows.size(),MAX_HEADER_ROWS);index++) {
            var header=rows.get(index).stream().map(value->value.strip().replace("\uFEFF","").replaceAll("\\s+","")).toList();
            int date=column(header,DATE_HEADERS), amount=column(header,AMOUNT_HEADERS);
            int withdrawal=column(header,WITHDRAWAL_HEADERS), payer=column(header,PAYER_HEADERS);
            int memo=column(header,List.of("적요","내용","메모","memo"));
            int direction=column(header,List.of("구분","입출금구분"));
            boolean sharedAmount=amount<0&&direction>=0&&column(header,List.of("거래금액"))>=0;
            // 거래금액·구분 양식의 내용은 입금자 표시, 메모는 별도 원문으로 보존합니다.
            if (sharedAmount) {
                amount=column(header,List.of("거래금액"));
                if (payer<0) payer=column(header,List.of("내용"));
                memo=column(header,List.of("메모","memo"));
            }
            // 입출금 은행 양식에 입금자 전용 열이 없으면 적요를 사용하고 원문도 메모에 보존합니다.
            if (payer<0 && withdrawal>=0) payer=column(header,List.of("적요"));
            if (date<0 || payer<0 || amount<0) continue;
            return new Columns(index,date,payer,amount,withdrawal,memo,
                column(header,List.of("거래번호","거래고유번호","reference")),
                column(header,List.of("거래시간","입금시간","시간","time")),
                column(header,List.of("잔액","거래후잔액","balance")),direction,sharedAmount);
        }
        throw new PaymentException("INVALID_BANK_HEADER");
    }
    private int column(List<String> headers,List<String> aliases) {
        for (int index=0;index<headers.size();index++) if (aliases.contains(headers.get(index).toLowerCase(Locale.ROOT))) return index;
        return -1;
    }
    private String cell(List<String> row,int index) { return index<0 || index>=row.size()?"":row.get(index); }
    /** 확장자와 실제 Excel 형식을 확인하고 XLSX의 압축 해제량을 제한합니다. */
    private List<List<String>> excel(byte[] bytes,boolean legacy) throws IOException {
        var magic=FileMagic.valueOf(bytes);
        if (magic!=(legacy?FileMagic.OLE2:FileMagic.OOXML)) throw new PaymentException("INVALID_BANK_FILE");
        if (!legacy) validateZip(bytes);
        try (Workbook workbook=legacy?new HSSFWorkbook(new ByteArrayInputStream(bytes)):new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            return workbookRows(workbook);
        }
    }
    /** 압축 파일을 열기 전에 항목 수와 전체 해제량을 검사해 과도한 메모리 사용을 막습니다. */
    private void validateZip(byte[] bytes) throws IOException {
        try (var zip=new ZipInputStream(new ByteArrayInputStream(bytes))) {
            int entries=0; long expanded=0; byte[] buffer=new byte[8192];
            while (zip.getNextEntry()!=null) {
                if (++entries>200) throw new PaymentException("INVALID_BANK_FILE");
                int size; while ((size=zip.read(buffer))!=-1) if ((expanded+=size)>20*1024*1024) throw new PaymentException("INVALID_BANK_FILE");
            }
            if (entries==0) throw new PaymentException("INVALID_BANK_FILE");
        }
    }
    /** 첫 시트의 값만 읽으며 수식·매크로를 실행하지 않고 수식·오류 셀은 거부합니다. */
    private List<List<String>> workbookRows(Workbook workbook) {
        if (workbook.getNumberOfSheets()==0) throw new PaymentException("INVALID_BANK_FILE");
        var sheet=workbook.getSheetAt(0);
        if (sheet.getLastRowNum()>=MAX_TRANSACTION_ROWS+MAX_HEADER_ROWS) throw new PaymentException("BANK_ROW_LIMIT");
        List<List<String>> rows=new ArrayList<>();
        for (org.apache.poi.ss.usermodel.Row row:sheet) {
            if (row.getLastCellNum()>100) throw new PaymentException("INVALID_BANK_FILE");
            List<String> values=new ArrayList<>();
            for (int index=0;index<row.getLastCellNum();index++) {
                Cell cell=row.getCell(index);
                if (cell==null || cell.getCellType()==CellType.BLANK) values.add("");
                else if (cell.getCellType()==CellType.STRING) values.add(cell.getStringCellValue());
                else if (cell.getCellType()==CellType.NUMERIC) values.add(DateUtil.isCellDateFormatted(cell)?
                    cell.getLocalDateTimeCellValue().toString():BigDecimal.valueOf(cell.getNumericCellValue()).stripTrailingZeros().toPlainString());
                else throw new PaymentException("INVALID_BANK_ROW");
            }
            if (values.stream().anyMatch(value->!value.isBlank())) rows.add(values);
        }
        return rows;
    }
    /** CSV의 따옴표 안 쉼표·줄바꿈을 보존하고 행·열·셀 크기와 미완성 따옴표를 제한합니다. */
    List<List<String>> csv(String source) {
        List<List<String>> rows=new ArrayList<>(); List<String> row=new ArrayList<>();
        var cell=new StringBuilder(); boolean quoted=false;
        for (int index=0;index<source.length();index++) {
            char character=source.charAt(index);
            if (character=='"') {
                if (quoted && index+1<source.length() && source.charAt(index+1)=='"') { cell.append('"');index++; }
                else if (quoted || cell.isEmpty()) quoted=!quoted;
                else throw new PaymentException("INVALID_BANK_FILE");
            } else if (character==',' && !quoted) { row.add(cell.toString());cell.setLength(0); }
            else if ((character=='\n'||character=='\r') && !quoted) {
                if (character=='\r'&&index+1<source.length()&&source.charAt(index+1)=='\n') index++;
                row.add(cell.toString());cell.setLength(0);
                if (row.stream().anyMatch(value->!value.isBlank())) rows.add(List.copyOf(row)); row.clear();
            } else cell.append(character);
            if (rows.size()>MAX_TRANSACTION_ROWS+MAX_HEADER_ROWS || row.size()>100 || cell.length()>1000) throw new PaymentException("BANK_ROW_LIMIT");
        }
        if (quoted) throw new PaymentException("INVALID_BANK_FILE");
        row.add(cell.toString()); if (row.stream().anyMatch(value->!value.isBlank())) rows.add(List.copyOf(row));
        return rows;
    }
}
