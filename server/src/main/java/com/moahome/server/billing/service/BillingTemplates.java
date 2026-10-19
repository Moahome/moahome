package com.moahome.server.billing.service;

import java.time.YearMonth;
import java.util.*;
import com.moahome.server.billing.domain.*;
import com.moahome.server.billing.repo.*;
import com.moahome.server.billing.exception.BillingException;
import static com.moahome.server.billing.exception.BillingException.Code.*;
import org.springframework.stereotype.Service;

@Service
public class BillingTemplates {
	private final FeeTemplateRepository templates;

	private final FeeTemplateItemRepository items;

	public BillingTemplates(FeeTemplateRepository templates, FeeTemplateItemRepository items) {
		this.templates = templates;
		this.items = items;
	}

	public List<FeeTemplate> versions(UUID propertyId) {
		return templates.findByPropertyIdAndDefaultTemplateTrueAndDeletedAtIsNullOrderByRevisionDesc(propertyId)
		    .stream().filter(template -> template.getStatus() == FeeTemplateStatus.ACTIVE).toList();
	}

	/** 적용월을 넘지 않는 버전 중 가장 마지막 저장본을 선택해 반복 변경 이력을 모두 보존합니다. */
	public FeeTemplate applicable(List<FeeTemplate> versions, YearMonth month) {
		return versions.stream().filter(template -> !template.getEffectiveFrom().isAfter(month.atDay(1))).findFirst()
		    .orElseThrow(() -> new BillingException(BILLING_SETTINGS_NOT_FOUND));
	}

	public List<FeeTemplateItem> items(FeeTemplate template) {
		List<FeeTemplateItem> result = items
		    .findByFeeTemplateIdAndActiveTrueAndDeletedAtIsNullOrderBySortOrderAsc(template.getId());
		if (result.isEmpty())
			throw new BillingException(BILLING_SETTINGS_NOT_FOUND);
		return result;
	}
}
