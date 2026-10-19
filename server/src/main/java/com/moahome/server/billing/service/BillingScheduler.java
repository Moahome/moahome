package com.moahome.server.billing.service;

import java.time.*;
import com.moahome.server.billing.domain.BillingCalendar;
import com.moahome.server.property.domain.PropertyStatus;
import com.moahome.server.property.repo.PropertyRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.*;
import org.springframework.stereotype.Component;

@Component
@EnableScheduling
@ConditionalOnProperty(name = "moahome.billing.scheduler-enabled", havingValue = "true", matchIfMissing = true)
public class BillingScheduler {
	private static final Logger LOG = LoggerFactory.getLogger(BillingScheduler.class);

	private final PropertyRepository properties;

	private final BillingGenerationService generation;

	private final Clock clock;

	public BillingScheduler(PropertyRepository properties, BillingGenerationService generation, Clock clock) {
		this.properties = properties;
		this.generation = generation;
		this.clock = clock;
	}

	/** 매시간·서버 시작 시 누락 월과 당월 누락 세대 청구를 복구하며 이미 확정된 원본은 재계산하지 않습니다. */
	@Scheduled(cron = "0 0 * * * *", zone = "Asia/Seoul")
	@EventListener(ApplicationReadyEvent.class)
	public void runDueBilling() {
		var current = BillingCalendar.currentMonth(clock);
		for (var property : properties.findAll()) {
			if (property.getDeletedAt() != null || property.getStatus() != PropertyStatus.ACTIVE
			    || property.getManagementStartedAt() == null)
				continue;
			for (var month = BillingCalendar.firstMonth(property); !month.isAfter(current); month = month
			    .plusMonths(1)) {
				try {
					generation.generate(property.getId(), month);
					if (month.equals(current))
						generation.supplementCurrentMonth(property.getId());
				} catch (RuntimeException exception) {
					// 개인정보·SQL 원문을 남기지 않고 실패 대상을 식별합니다. 다른 대상은 계속하며 실패 대상은 다음 실행에 복구합니다.
					LOG.error("Automatic billing failed for property {} month {} ({})", property.getId(), month,
					    exception.getClass().getSimpleName());
					break;
				}
			}
		}
	}
}
