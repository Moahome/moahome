package com.moahome.server.common.json;

import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.cfg.CoercionAction;
import tools.jackson.databind.cfg.CoercionInputShape;
import tools.jackson.databind.type.LogicalType;

public final class StrictJsonMapper {

	private StrictJsonMapper() {
	}

	/** 전역 Mapper의 모듈을 유지한 복사본에만 엄격한 입력 설정을 적용합니다. 적용 DTO는 각 Converter가 정합니다. */
	public static ObjectMapper create(ObjectMapper mapper) {
		return mapper.rebuild().disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)
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
}
