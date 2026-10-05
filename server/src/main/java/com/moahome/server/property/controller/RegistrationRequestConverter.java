package com.moahome.server.property.controller;

import java.io.IOException;
import com.moahome.server.property.dto.BasicInfoRequest;
import com.moahome.server.property.dto.PropertyRegistrationRequest;
import org.springframework.http.*;
import org.springframework.http.converter.*;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.*;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.cfg.CoercionAction;
import tools.jackson.databind.cfg.CoercionInputShape;
import tools.jackson.databind.type.LogicalType;
import com.moahome.server.property.exception.RegistrationException;
import tools.jackson.databind.exc.MismatchedInputException;
import tools.jackson.databind.exc.InvalidFormatException;

/** 등록 DTO에만 엄격한 JSON 읽기를 적용해 기존 인증 API의 역직렬화 설정을 유지합니다. */
@Component
public class RegistrationRequestConverter extends AbstractHttpMessageConverter<Object> {
	private final ObjectMapper mapper;

	public RegistrationRequestConverter(ObjectMapper mapper) {
		super(MediaType.APPLICATION_JSON, new MediaType("application", "*+json"));
		this.mapper = mapper.rebuild()
			.disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)
			.disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
			.enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
			.enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
			.enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
			.withCoercionConfig(LogicalType.Textual, coercion -> coercion
				.setCoercion(CoercionInputShape.Integer, CoercionAction.Fail)
				.setCoercion(CoercionInputShape.Float, CoercionAction.Fail)
				.setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail))
			.build();
	}

	@Override
	protected boolean supports(Class<?> type) {
		return type == BasicInfoRequest.class || type == PropertyRegistrationRequest.class;
	}

	@Override
	public boolean canWrite(Class<?> type, MediaType mediaType) {
		return false;
	}

	@Override
	protected Object readInternal(Class<?> type, HttpInputMessage input) throws IOException {
		try {
			JsonNode body = mapper.readTree(input.getBody());
			if (type == PropertyRegistrationRequest.class && body != null && body.isObject()) {
				JsonNode id = body.get("requestId");
				if (id != null && !id.isNull() && (!id.isString() || !id.asString().matches(
					"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"))) {
					throw RegistrationException.invalid("requestId", id.isString() ? "INVALID_FORMAT" : "INVALID_TYPE",
						"등록 요청 ID를 확인해주세요.");
				}
			}
			return mapper.treeToValue(body, type);
		} catch (JacksonException exception) {
			String field = safeField(exception);
			if (!field.isEmpty()) {
				String reason = exception instanceof MismatchedInputException && !(exception instanceof InvalidFormatException)
					? "INVALID_TYPE" : "INVALID_FORMAT";
				throw RegistrationException.invalid(field, reason, "입력 형식이 올바르지 않습니다.");
			}
			throw new HttpMessageNotReadableException("Invalid registration JSON", exception, input);
		}
	}

	/** 알려진 계약 필드와 배열 인덱스만 반환해 사용자 정의 키나 입력 원문을 오류에서 제외합니다. */
	private String safeField(JacksonException exception) {
		var allowed = java.util.Set.of("requestId", "basicInfo", "name", "address", "addressDetail", "propertyType",
			"hasBuildings", "buildings", "clientId", "units", "buildingClientId", "unitNumber", "displayName",
			"floor", "status", "bankAccounts", "bankCode", "bankName", "accountNumber", "holderName",
			"isPrimary", "feeItems", "itemName", "defaultAmount");
		StringBuilder path = new StringBuilder();
		for (var reference : exception.getPath()) {
			String name = reference.getPropertyName();
			if (name != null) {
				if (!allowed.contains(name)) { return ""; }
				if (!path.isEmpty()) { path.append('.'); }
				path.append(name);
				continue;
			}
			if (reference.getIndex() >= 0) { path.append('[').append(reference.getIndex()).append(']'); }
		}
		return path.toString();
	}

	@Override
	protected void writeInternal(Object value, HttpOutputMessage output) {
		throw new UnsupportedOperationException();
	}
}
