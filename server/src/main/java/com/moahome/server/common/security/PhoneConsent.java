package com.moahome.server.common.security;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.Getter;

/** 번호에 대한 동의 확인을 보호값과 함께 보관하며 실제 과거 동의일을 이관 시각으로 대체하지 않습니다. */
@Getter
@Embeddable
public class PhoneConsent {

	@Column(name = "phone_consent", nullable = false)
	private boolean confirmed;

	@Column(name = "phone_consent_source", length = 30)
	private String source;

	@Column(name = "phone_consent_recorded_at", columnDefinition = "timestamptz")
	private OffsetDateTime recordedAt;

	@Column(name = "phone_consent_recorded_by")
	private UUID recordedBy;

	@Column(name = "phone_consent_notice_version", length = 30)
	private String noticeVersion;

	protected PhoneConsent() {
	}

	public static PhoneConsent none() {
		return new PhoneConsent();
	}

	/** 확인 경로는 서버가 결정하며 클라이언트가 과거 이관·타인 동의로 위장할 수 없게 합니다. */
	public static PhoneConsent confirm(String source, UUID actor, OffsetDateTime at) {
		if (!Set.of("SELF", "ADMIN", "EXCEL").contains(source)) {
			throw new IllegalArgumentException("Invalid consent source");
		}
		PhoneConsent consent = new PhoneConsent();
		consent.confirmed = true;
		consent.source = source;
		consent.recordedAt = Objects.requireNonNull(at);
		consent.recordedBy = Objects.requireNonNull(actor);
		consent.noticeVersion = "PHONE_V1";
		return consent;
	}

	/** 같은 확인을 여러 저장소로 반영해도 JPA 임베디드 인스턴스를 공유하지 않습니다. */
	public PhoneConsent copy() {
		PhoneConsent copy = new PhoneConsent();
		copy.confirmed = confirmed;
		copy.source = source;
		copy.recordedAt = recordedAt;
		copy.recordedBy = recordedBy;
		copy.noticeVersion = noticeVersion;
		return copy;
	}
}
