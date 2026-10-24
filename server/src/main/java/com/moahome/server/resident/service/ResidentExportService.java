package com.moahome.server.resident.service;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import com.moahome.server.common.security.PhoneSecurity;
import com.moahome.server.resident.dto.*;
import com.moahome.server.resident.exception.ResidentRegistrationException;
import com.moahome.server.resident.repo.ResidentRepository;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import static com.moahome.server.resident.exception.ResidentRegistrationException.Code.*;
import com.moahome.server.resident.domain.Resident;

@Service
public class ResidentExportService {
	private final ResidentListService lists;

	private final ResidentRepository residents;

	private final ObjectProvider<PhoneSecurity> phones;

	public ResidentExportService(ResidentListService lists, ResidentRepository residents,
	    ObjectProvider<PhoneSecurity> phones) {
		this.lists = lists;
		this.residents = residents;
		this.phones = phones;
	}

	/** 관리소장 권한과 전체 대상 ID를 검증한 뒤 같은 조회 스냅샷의 연락처를 복호화해 요청 순서로 반환합니다. */
	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	public ResidentExportResponse export(UUID actor, UUID propertyId, ResidentExportRequest input) {
		// 기존 목록 조회가 현재 관리자·정상 관리대상 권한을 검증하며 일반 조회 응답은 마스킹을 유지합니다.
		var directory = lists.list(actor, propertyId);
		List<UUID> ids = input.residentIds();
		if (ids == null || ids.isEmpty() || ids.stream().anyMatch(Objects::isNull)
		    || new HashSet<>(ids).size() != ids.size()) {
			throw new IllegalArgumentException("Invalid resident selection");
		}
		Map<UUID, ResidentListResponse.ResidentItem> rows = directory.residents().stream()
		    .collect(Collectors.toMap(ResidentListResponse.ResidentItem::id, Function.identity()));
		// 삭제·다른 대상·존재하지 않는 ID를 일부 누락한 파일로 만들지 않고 명부 재확인을 요청합니다.
		if (!rows.keySet().containsAll(ids))
			throw new ResidentRegistrationException(RESIDENT_NOT_FOUND);
		Map<UUID, Resident> records = residents.findByPropertyIdAndIdInAndDeletedAtIsNull(propertyId, ids).stream()
		    .collect(Collectors.toMap(com.moahome.server.resident.domain.Resident::getId, Function.identity()));
		if (records.size() != ids.size())
			throw new ResidentRegistrationException(RESIDENT_NOT_FOUND);
		Map<UUID, String> buildings = directory.buildings().stream().collect(Collectors
		    .toMap(ResidentListResponse.ResidentBuildingItem::id, ResidentListResponse.ResidentBuildingItem::name));
		ArrayList<ResidentExportResponse.Row> result = new ArrayList<ResidentExportResponse.Row>();
		for (var id : ids) {
			var row = rows.get(id);
			var record = records.get(id);
			result.add(new ResidentExportResponse.Row(row.name(), decrypt(record.getPhoneEncrypted()),
			    unitLabel(row, buildings, directory.hasBuildings())));
		}
		return new ResidentExportResponse(List.copyOf(result));
	}

	/** 연락처 없는 주민은 키 없이 내보내고 복호화 실패는 부분 원문 응답 없이 고정 업무 오류로 처리합니다. */
	private String decrypt(String encrypted) {
		if (encrypted == null)
			return null;
		try {
			return phones.getObject().decrypt(encrypted);
		} catch (BeansException | IllegalArgumentException | IllegalStateException exception) {
			throw new ResidentRegistrationException(PHONE_SECURITY_UNAVAILABLE);
		}
	}

	/** 현재 소속이 없는 명부도 유지하며 화면의 동·호수 표기와 동일한 값으로 내보냅니다. */
	private String unitLabel(ResidentListResponse.ResidentItem row, Map<UUID, String> buildings, boolean hasBuildings) {
		if (row.unitNumber() == null)
			return "—";
		String number = row.unitNumber().endsWith("호") ? row.unitNumber() : row.unitNumber() + "호";
		if (!hasBuildings)
			return number;
		return buildings.getOrDefault(row.buildingId(), "—") + " " + number;
	}
}
