package com.moahome.server.billing.controller;

import java.io.IOException;
import com.moahome.server.billing.dto.BillingSettingsRequest;
import org.springframework.http.*;
import org.springframework.http.converter.*;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.*;
import tools.jackson.databind.cfg.CoercionAction;
import tools.jackson.databind.cfg.CoercionInputShape;
import tools.jackson.databind.type.LogicalType;

/** 관리비 정수 금액을 소수에서 잘라 저장하지 않고 요청 타입·중복 키·추가 필드를 엄격히 확인합니다. */
@Component
public class BillingRequestConverter extends AbstractHttpMessageConverter<Object> {
	private final ObjectMapper mapper;

	public BillingRequestConverter(ObjectMapper mapper) {
		super(MediaType.APPLICATION_JSON, new MediaType("application", "*+json"));
		this.mapper = mapper.rebuild().disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)
		    .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
		    .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
		    .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
		    .withCoercionConfig(LogicalType.Textual,
		        coercion -> coercion.setCoercion(CoercionInputShape.Integer, CoercionAction.Fail)
		            .setCoercion(CoercionInputShape.Float, CoercionAction.Fail)
		            .setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail))
		    .withCoercionConfig(LogicalType.Enum,
		        coercion -> coercion.setCoercion(CoercionInputShape.Integer, CoercionAction.Fail)
		            .setCoercion(CoercionInputShape.Float, CoercionAction.Fail)
		            .setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail)
		            .setCoercion(CoercionInputShape.EmptyString, CoercionAction.Fail))
		    .build();
	}

	@Override
	protected boolean supports(Class<?> type) {
		return type == BillingSettingsRequest.class;
	}

	@Override
	public boolean canWrite(Class<?> type, MediaType mediaType) {
		return false;
	}

	@Override
	protected Object readInternal(Class<?> type, HttpInputMessage input) throws IOException {
		try {
			var body = mapper.readTree(input.getBody());
			var revision = body == null ? null : body.get("revisionId");
			if (revision != null && !revision.isNull() && (!revision.isString() || !revision.asString()
			    .matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"))) {
				throw new HttpMessageNotReadableException("Invalid billing revision", input);
			}
			return mapper.treeToValue(body, type);
		} catch (JacksonException exception) {
			throw new HttpMessageNotReadableException("Invalid billing JSON", exception, input);
		}
	}

	@Override
	protected void writeInternal(Object value, HttpOutputMessage output) {
		throw new UnsupportedOperationException();
	}
}
