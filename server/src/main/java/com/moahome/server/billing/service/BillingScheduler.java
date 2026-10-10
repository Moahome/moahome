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
@ConditionalOnProperty(name="moahome.billing.scheduler-enabled", havingValue="true", matchIfMissing=true)
public class BillingScheduler {
    private static final Logger LOG = LoggerFactory.getLogger(BillingScheduler.class);
    private final PropertyRepository properties;
    private final BillingGenerationService generation;
    private final Clock clock;
    public BillingScheduler(PropertyRepository properties, BillingGenerationService generation, Clock clock) {
        this.properties=properties; this.generation=generation; this.clock=clock;
    }
    /** 1일 00시를 포함해 매시간 누락 월을 재시도하고 재시작 때도 중단된 실행을 복구합니다. */
    @Scheduled(cron="0 0 * * * *", zone="Asia/Seoul")
    @EventListener(ApplicationReadyEvent.class)
    public void runDueBilling() {
        var current = BillingCalendar.currentMonth(clock);
        for (var property : properties.findAll()) {
            if (property.getDeletedAt()!=null || property.getStatus()!=PropertyStatus.ACTIVE) continue;
            for (var month=BillingCalendar.firstMonth(property); !month.isAfter(current); month=month.plusMonths(1)) {
                try { generation.generate(property.getId(), month); }
                catch (RuntimeException exception) {
                    // 개인정보·SQL 원문을 남기지 않고 실패 대상을 식별합니다. 다른 대상은 계속하며 실패 대상은 다음 실행에 복구합니다.
                    LOG.error("Automatic billing failed for property {} month {} ({})", property.getId(), month, exception.getClass().getSimpleName());
                    break;
                }
            }
        }
    }
}
