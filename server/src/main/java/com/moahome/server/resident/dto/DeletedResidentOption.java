package com.moahome.server.resident.dto;

import java.util.UUID;

/** 삭제 명부 복구 선택에는 ID·이름만 제공하고 이미 파기한 전화번호를 반환하지 않습니다. */
public record DeletedResidentOption(UUID id, String name) {
}
