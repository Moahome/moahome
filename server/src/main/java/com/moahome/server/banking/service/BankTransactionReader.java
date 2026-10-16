package com.moahome.server.banking.service;

import java.io.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.zip.ZipInputStream;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import com.moahome.server.payment.exception.PaymentException;

@Component
public class BankTransactionReader {
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
            if (name.endsWith(".xlsx")) rows=xlsx(bytes);
            else if (name.endsWith(".csv")) rows=csv(StandardCharsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString());
            else throw new PaymentException("INVALID_BANK_FILE");
            if (rows.size()<2 || rows.size()>5001) throw new PaymentException("BANK_ROW_LIMIT");
            var header=rows.getFirst().stream().map(value -> value.strip().replace("\uFEFF","").replaceAll("\\s+","")).toList();
            int date=column(header,List.of("입금일","거래일","거래일자","거래일시","일자","date"));
            int payer=column(header,List.of("입금자명","입금자","보낸분","보내신분","거래자명","payer"));
            int amount=column(header,List.of("입금액","입금금액","입금","amount"));
            int memo=column(header,List.of("적요","내용","메모","memo"));
            int ref=column(header,List.of("거래번호","거래고유번호","reference"));
            int timeColumn=column(header,List.of("거래시간","입금시간","시간","time"));
            int balanceColumn=column(header,List.of("잔액","거래후잔액","balance"));
            if (date<0 || payer<0 || amount<0) throw new PaymentException("INVALID_BANK_HEADER");
            List<Row> result=new ArrayList<>();
            for (var row: rows.subList(1,rows.size())) {
                String raw=cell(row,amount).replace(",","").replace("원","").strip();
                if (raw.isEmpty() || raw.equals("0")) continue; // 입금액이 없는 출금 행은 수납 후보로 만들지 않습니다.
                if (!raw.matches("[0-9]{1,15}")) throw new PaymentException("INVALID_BANK_ROW");
                BigDecimal value=new BigDecimal(raw);
                if (value.signum()<=0) throw new PaymentException("INVALID_BANK_ROW");
                String depositor=cell(row,payer).strip();
                String text=cell(row,memo).strip(), reference=cell(row,ref).strip();
                if (depositor.isBlank() || depositor.length()>100 || text.length()>500 || reference.length()>200)
                    throw new PaymentException("INVALID_BANK_ROW");
                String rawDate=cell(row,date).strip().replace('.', '-').replace('/', '-');
                LocalDate day;
                if (rawDate.matches("[0-9]{8}")) day=LocalDate.parse(rawDate,java.time.format.DateTimeFormatter.BASIC_ISO_DATE);
                else if (rawDate.matches("[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}.*")) {
                    String[] pieces=rawDate.split("[ T]")[0].split("-");
                    day=LocalDate.of(Integer.parseInt(pieces[0]),Integer.parseInt(pieces[1]),Integer.parseInt(pieces[2]));
                } else if (rawDate.matches("[0-9]{1,6}(\\.[0-9]+)?")) day=DateUtil.getLocalDateTime(Double.parseDouble(rawDate)).toLocalDate();
                else throw new PaymentException("INVALID_BANK_ROW");
                if (day.getYear()<1000 || day.getYear()>9999) throw new PaymentException("INVALID_BANK_ROW");
                String timeValue=cell(row,timeColumn).strip();
                if (timeValue.isEmpty() && rawDate.split("[ T]").length>1) timeValue=rawDate.split("[ T]")[1];
                if (timeValue.contains("T")) timeValue=timeValue.split("T")[1];
                LocalTime time=timeValue.isEmpty()?null:LocalTime.parse(timeValue);
                String rawBalance=cell(row,balanceColumn).replace(",","").replace("원","").strip();
                if (!rawBalance.isEmpty()&&!rawBalance.matches("-?[0-9]{1,15}")) throw new PaymentException("INVALID_BANK_ROW");
                BigDecimal balance=rawBalance.isEmpty()?null:new BigDecimal(rawBalance);
                result.add(new Row(day,depositor,value,text.isEmpty()?null:text,reference.isEmpty()?null:reference,time,balance));
            }
            if (result.isEmpty()) throw new PaymentException("EMPTY_BANK_FILE");
            return List.copyOf(result);
        } catch (PaymentException exception) { throw exception; }
        catch (Exception exception) { throw new PaymentException("INVALID_BANK_FILE"); }
    }
    private int column(List<String> headers,List<String> aliases) {
        for (int index=0;index<headers.size();index++) if (aliases.contains(headers.get(index).toLowerCase(Locale.ROOT))) return index;
        return -1;
    }
    private String cell(List<String> row,int index) { return index<0 || index>=row.size()?"":row.get(index); }
    private List<List<String>> xlsx(byte[] bytes) throws IOException {
        try (var zip=new ZipInputStream(new ByteArrayInputStream(bytes))) {
            int entries=0; long expanded=0; byte[] buffer=new byte[8192];
            while (zip.getNextEntry()!=null) {
                if (++entries>200) throw new PaymentException("INVALID_BANK_FILE");
                int size; while ((size=zip.read(buffer))!=-1) if ((expanded+=size)>20*1024*1024) throw new PaymentException("INVALID_BANK_FILE");
            }
            if (entries==0) throw new PaymentException("INVALID_BANK_FILE");
        }
        try (var workbook=new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            if (workbook.getNumberOfSheets()==0) throw new PaymentException("INVALID_BANK_FILE");
            var sheet=workbook.getSheetAt(0);
            if (sheet.getLastRowNum()>5000) throw new PaymentException("BANK_ROW_LIMIT");
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
            if (rows.size()>5001 || row.size()>100 || cell.length()>1000) throw new PaymentException("BANK_ROW_LIMIT");
        }
        if (quoted) throw new PaymentException("INVALID_BANK_FILE");
        row.add(cell.toString()); if (row.stream().anyMatch(value->!value.isBlank())) rows.add(List.copyOf(row));
        return rows;
    }
}
