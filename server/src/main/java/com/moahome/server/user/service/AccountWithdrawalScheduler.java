package com.moahome.server.user.service;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "moahome.account-withdrawal.scheduler-enabled", havingValue = "true", matchIfMissing = true)
public class AccountWithdrawalScheduler {
	private static final Logger LOG = LoggerFactory.getLogger(AccountWithdrawalScheduler.class);
	private final AccountLifecycleService accounts;

	public AccountWithdrawalScheduler(AccountLifecycleService accounts) {
		this.accounts = accounts;
	}

	/** 중단 중 만료된 계정도 기동 시 재검사하며 외부 저장소 실패는 다음 주기에 다시 처리합니다. */
	@Scheduled(fixedDelay = 60_000)
	@EventListener(ApplicationReadyEvent.class)
	public void finalizeExpiredAccounts() {
		try {
			for (UUID userId : accounts.expired()) {
				try {
					accounts.finalizeExpired(userId);
				} catch (RuntimeException exception) {
					LOG.warn("유예 만료 계정 삭제가 완료되지 않았습니다. 다음 주기에 재시도합니다.");
				}
			}
		} catch (RuntimeException exception) {
			LOG.warn("유예 만료 계정 조회에 실패했습니다. 다음 주기에 재시도합니다.");
		}
	}
}
