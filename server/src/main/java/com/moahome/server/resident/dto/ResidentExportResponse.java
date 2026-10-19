package com.moahome.server.resident.dto;

import java.util.List;
import io.swagger.v3.oas.annotations.media.Schema;

/** 미리보기·엑셀에 허용된 세 항목만 반환하며 로그용 문자열에는 원문을 포함하지 않습니다. */
public record ResidentExportResponse(List<Row> residents) {
	@Override
	public String toString() {
		return "ResidentExportResponse[REDACTED]";
	}

	@Schema(name = "ResidentExportRow")
	public record Row(String name, String phone, String unitLabel) {
		@Override
		public String toString() {
			return "ResidentExportResponse.Row[REDACTED]";
		}
	}
}
