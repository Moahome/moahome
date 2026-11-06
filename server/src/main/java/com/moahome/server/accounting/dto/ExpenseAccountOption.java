package com.moahome.server.accounting.dto;

/** 회계 시작 전에도 기본 비용 코드를 선택할 수 있으며 저장할 때 대상의 실제 계정 ID로 해석합니다. */
public record ExpenseAccountOption(String code, String name) {
}
