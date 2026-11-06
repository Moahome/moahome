package com.moahome.server.property.service;

import java.util.*;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.moahome.server.property.domain.Building;
import com.moahome.server.property.dto.RegistrationResidentPreview;
import com.moahome.server.resident.service.ResidentExcelReader;
import com.moahome.server.resident.service.ResidentRegistrationService;
import com.moahome.server.user.service.UserService;

@Service
public class RegistrationResidentPreviewService {
	private final UserService users;
	private final ResidentExcelReader reader;

	public RegistrationResidentPreviewService(UserService users, ResidentExcelReader reader) {
		this.users = users;
		this.reader = reader;
	}

	/** 생성 권한과 저장 전 세대 초안으로 파일을 검증하며 원본·검증 결과를 DB나 Redis에 저장하지 않습니다. */
	@Transactional(readOnly = true)
	public List<RegistrationResidentPreview.Row> preview(UUID actor, RegistrationResidentPreview.Setup setup,
	    MultipartFile file) {
		users.requirePropertyCreation(actor);
		Map<String, String> names = new HashMap<>();
		for (var building : setup.buildings()) {
			if (names.put(building.clientId(), building.name()) != null) {
				throw new IllegalArgumentException("Duplicate building");
			}
		}
		Map<String, RegistrationResidentPreview.UnitReference> targets = new HashMap<>();
		for (var unit : setup.units()) {
			if (setup.hasBuildings() ? !names.containsKey(unit.buildingClientId()) : unit.buildingClientId() != null) {
				throw new IllegalArgumentException("Invalid unit building");
			}
			String name = setup.hasBuildings() ? names.get(unit.buildingClientId()) : "";
			if (targets.put(key(name, unit.unitNumber()), unit) != null) {
				throw new IllegalArgumentException("Ambiguous unit");
			}
		}
		if (setup.administrator() != null && setup.administrator().unitIndex() >= setup.units().size()) {
			throw new IllegalArgumentException("Invalid administrator unit");
		}
		Set<String> contacts = new HashSet<>();
		List<RegistrationResidentPreview.Row> rows = new ArrayList<>();
		for (var row : reader.read(file)) {
			String building = setup.hasBuildings() ? Building.normalizeName(row.building()) : "";
			var unit = targets.get(key(building, row.unitNumber()));
			String relation = ResidentExcelReader.normalizeRelation(row.relation());
			String consent = row.phoneConsent().strip().toUpperCase(Locale.ROOT);
			String failure = null;
			if (row.invalidCell()) {
				failure = "수식·오류·논리값 셀은 사용할 수 없어요.";
			} else if (!Set.of("", "O", "X").contains(consent)) {
				failure = "전화번호 수집 동의는 O 또는 X로 입력해주세요.";
			} else if (row.name().isBlank() || row.name().codePointCount(0, row.name().length()) > 50) {
				failure = "이름을 1~50자로 입력해주세요.";
			} else if (unit == null || (!setup.hasBuildings() && !row.building().isBlank())) {
				failure = "앞 단계에 등록한 동·호수를 확인해주세요.";
			} else if (relation == null) {
				failure = "주민 구분을 확인해주세요.";
			}
			boolean administrator = failure == null && setup.administrator() != null
			    && setup.units().get(setup.administrator().unitIndex()).equals(unit)
			    && setup.administrator().name().strip().equals(row.name());
			String phone = null;
			if (failure == null && !administrator && "O".equals(consent) && !row.phone().isBlank()) {
				try {
					phone = ResidentRegistrationService.normalizePhone(row.phone());
				} catch (IllegalArgumentException invalid) {
					failure = "전화번호 형식을 확인해주세요.";
				}
			}
			boolean duplicate = phone != null && !contacts.add(row.name() + "\u0000" + phone);
			String status = failure != null ? "ERROR" : administrator || duplicate ? "DUPLICATE" : "READY";
			String reason = failure != null ? failure : "등록 가능";
			if (administrator) {
				reason = "담당자 단계에 등록된 관리소장 · 중복 제외";
			} else if (duplicate) {
				reason = "파일의 앞선 행과 이름·전화번호가 같아요.";
			} else if (failure == null && !"O".equals(consent)) {
				reason = "등록 가능 · 동의 미확인으로 전화번호 제외";
			}
			rows.add(new RegistrationResidentPreview.Row(row.rowNumber(), unit == null ? null : unit.buildingClientId(),
			    unit == null ? row.unitNumber() : unit.unitNumber(), row.name(), "READY".equals(status) ? phone : null,
			    "O".equals(consent), relation == null ? "OTHER" : relation, status, reason));
		}
		return List.copyOf(rows);
	}

	/** 호 접미사만 정리하고 앞자리 0·문자·동 이름은 보존하며 모호한 세대는 위에서 거부합니다. */
	private String key(String building, String number) {
		return building + "\u0000" + number.strip().replaceFirst("호$", "").strip();
	}
}
