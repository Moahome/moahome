package com.moahome.server.resident.dto;

import java.util.UUID;

/** 등록 결과에도 전체 번호·암호문·검색값은 반환하지 않습니다. */
public record ResidentRegistrationResponse(UUID id, UUID propertyId, UUID unitId, boolean representative) { }
