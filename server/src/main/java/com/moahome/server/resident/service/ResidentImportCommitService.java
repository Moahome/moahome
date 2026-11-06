package com.moahome.server.resident.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.moahome.server.resident.dto.ResidentRegistrationRequest;
import com.moahome.server.resident.dto.ResidentRegistrationResponse;
import com.moahome.server.resident.exception.ResidentImportException;
import com.moahome.server.property.repo.PropertyRepository;
import com.moahome.server.resident.repo.ResidentImportBatchRepository;

@Service
public class ResidentImportCommitService {
	private final PropertyRepository properties;
	private final ResidentImportBatchRepository batches;
	private final ResidentRegistrationService registrations;
	private final Clock clock;

	public ResidentImportCommitService(PropertyRepository properties, ResidentImportBatchRepository batches,
	    ResidentRegistrationService registrations, Clock clock) {
		this.properties = properties;
		this.batches = batches;
		this.registrations = registrations;
		this.clock = clock;
	}

	/** 번호 파기와 같은 관리대상 잠금을 잡고 배치 유효성 재검사·한 행 저장을 원자적으로 수행합니다. */
	@Transactional
	public ResidentRegistrationResponse register(UUID actor, UUID property, UUID batch,
	    ResidentRegistrationRequest request) {
		properties.findForUnitUpdate(property).orElseThrow(() -> new ResidentImportException("IMPORT_EXPIRED"));
		batches.findByIdAndPropertyIdAndCreatedBy(batch, property, actor)
		    .filter(value -> value.getExpiresAt().isAfter(OffsetDateTime.now(clock)))
		    .orElseThrow(() -> new ResidentImportException("IMPORT_EXPIRED"));
		return registrations.registerWithConsentSource(actor, property, request, "EXCEL");
	}
}
