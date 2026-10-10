package com.moahome.server.resident.dto;

/** 업로드 원본의 연락처는 암호화한 뒤 보관하며 응답에는 안전한 표시 필드만 사용합니다. */
public record ResidentImportRow(int rowNumber, java.util.UUID requestId, String building, String unitNumber,
    String name, String relationType, java.util.UUID unitId, String phoneEncrypted, String phoneLast4,
    String status, String reason) {
    @Override public String toString() { return "ResidentImportRow[REDACTED]"; }
}
