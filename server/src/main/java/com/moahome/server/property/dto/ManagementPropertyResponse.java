package com.moahome.server.property.dto;

import java.util.UUID;
import com.moahome.server.membership.domain.PropertyMemberRole;

/** 현재 관리 영역 접근에 필요한 최소 정보만 반환하며 등록 당시 스냅샷을 사용하지 않습니다. */
public record ManagementPropertyResponse(UUID propertyId, String name, PropertyMemberRole role) {
}
