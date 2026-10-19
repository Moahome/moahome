package com.moahome.server.resident.dto;

import java.util.List;
import java.util.UUID;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

/** 화면에서 검색·정렬한 전체 결과의 ID만 받으며 주민 정보나 연락처를 요청에 싣지 않습니다. */
public record ResidentExportRequest(@NotEmpty List<@NotNull UUID> residentIds) {
}
