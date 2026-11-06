package com.moahome.server.resident.dto;

import java.util.UUID;

/** 동의한 연락처만 암호화해 임시 보관하며 동의 여부는 저장 재시도에서도 다시 확인합니다. */
public record ResidentImportRow(int rowNumber, UUID requestId, String building, String unitNumber,
    String name, String relationType, UUID unitId, String phoneEncrypted, String phoneLast4, String status,
    String reason, Boolean phoneConsent) {
	/** 이전 임시 JSON의 누락·null 동의는 미동의로 고정하며 전역 JSON 검증을 완화하지 않습니다. */
	public ResidentImportRow {
		phoneConsent = Boolean.TRUE.equals(phoneConsent);
	}
	@Override
	public String toString() {
		return "ResidentImportRow[REDACTED]";
	}
}
