package com.moahome.server.property.dto;

import java.util.List;

public record ManagedPropertiesResponse(List<ManagementPropertyResponse> properties) {
	public ManagedPropertiesResponse {
		properties = List.copyOf(properties);
	}
}
