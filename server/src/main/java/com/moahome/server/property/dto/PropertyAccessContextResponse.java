package com.moahome.server.property.dto;

import java.util.UUID;
import com.moahome.server.membership.domain.PropertyMemberRole;

public record PropertyAccessContextResponse(UUID propertyId, String name, PropertyMemberRole role,
    boolean residentEligible) {
}
