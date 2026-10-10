package com.moahome.server.resident.service;

import java.time.*;
import java.util.*;
import com.moahome.server.auth.exception.*;
import com.moahome.server.common.security.PhoneSecurity;
import com.moahome.server.membership.domain.PropertyMemberRole;
import com.moahome.server.property.domain.*;
import com.moahome.server.property.repo.*;
import com.moahome.server.property.service.ManagementAccessService;
import com.moahome.server.resident.domain.ResidentImportBatch;
import com.moahome.server.resident.dto.*;
import com.moahome.server.resident.exception.*;
import com.moahome.server.resident.repo.*;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.BeansException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.ObjectMapper;

@Service
public class ResidentImportService {
    private final ManagementAccessService access;
    private final PropertyRepository properties;
    private final BuildingRepository buildings;
    private final UnitRepository units;
    private final ResidentRepository residents;
    private final ResidentImportBatchRepository batches;
    private final ResidentRegistrationService registrations;
    private final ResidentExcelReader reader;
    private final ObjectProvider<PhoneSecurity> phones;
    private final ObjectMapper mapper;
    private final Clock clock;

    public ResidentImportService(ManagementAccessService access, PropertyRepository properties, BuildingRepository buildings,
        UnitRepository units, ResidentRepository residents, ResidentImportBatchRepository batches,
        ResidentRegistrationService registrations, ResidentExcelReader reader, ObjectProvider<PhoneSecurity> phones,
        ObjectMapper mapper, Clock clock) {
        this.access = access; this.properties = properties; this.buildings = buildings; this.units = units;
        this.residents = residents; this.batches = batches; this.registrations = registrations; this.reader = reader;
        this.phones = phones; this.mapper = mapper; this.clock = clock;
    }

    /** 현재 관리소장에게만 업로드를 허용하고 정규화·세대 연결·중복 검증 결과를 암호화 연락처와 함께 임시 보관합니다. */
    @Transactional
    public ResidentImportResponse preview(UUID actor, UUID propertyId, MultipartFile file) {
        requireAdmin(actor, propertyId);
        var property = properties.findById(propertyId).orElseThrow(() -> new AuthException(AuthErrorCode.ACCESS_DENIED));
        var source = reader.read(file);
        Map<UUID, String> buildingNames = new HashMap<>();
        buildings.findByPropertyIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc(propertyId).stream()
            .filter(building -> building.getStatus() == BuildingStatus.ACTIVE)
            .forEach(building -> buildingNames.put(building.getId(), building.getName()));
        Map<String, UUID> targets = new HashMap<>();
        units.findByPropertyIdAndDeletedAtIsNull(propertyId).stream().filter(unit -> unit.getStatus() != UnitStatus.INACTIVE)
            .filter(unit -> property.isHasBuildings() ? buildingNames.containsKey(unit.getBuildingId()) : unit.getBuildingId() == null)
            .forEach(unit -> targets.put(key(buildingNames.getOrDefault(unit.getBuildingId(), ""), unit.getUnitNumber()), unit.getId()));
        Set<String> contacts = new HashSet<>();
        List<ResidentImportRow> rows = source.stream().map(row -> validate(row, property, targets, contacts)).toList();
        var batch = batches.saveAndFlush(ResidentImportBatch.create(propertyId, actor, mapper.writeValueAsString(rows), OffsetDateTime.now(clock)));
        return response(batch, rows.stream().map(row -> display(row, row.status(), row.reason(), false)).toList());
    }

    /** 선택된 정상 행을 원본 순서로 각각 저장합니다. 입력·중복 오류는 제외하고 통신 재시도는 같은 주민 ID로 복구합니다. */
    public ResidentImportResponse commit(UUID actor, UUID propertyId, UUID importId, ResidentImportCommitRequest request) {
        requireAdmin(actor, propertyId);
        var batch = batches.findByIdAndPropertyIdAndCreatedBy(importId, propertyId, actor)
            .filter(value -> value.getExpiresAt().isAfter(OffsetDateTime.now(clock)))
            .orElseThrow(() -> new ResidentImportException("IMPORT_EXPIRED"));
        var type = mapper.getTypeFactory().constructCollectionType(List.class, ResidentImportRow.class);
        List<ResidentImportRow> rows = mapper.readValue(batch.getRowsPayload(), type);
        Set<Integer> selected = new HashSet<>(request.rowNumbers());
        Set<Integer> available = new HashSet<>();
        rows.stream().filter(row -> row.status().equals("READY")).forEach(row -> available.add(row.rowNumber()));
        if (selected.isEmpty() || selected.size() != request.rowNumbers().size() || !available.containsAll(selected)) {
            throw new IllegalArgumentException("Invalid selection");
        }
        List<ResidentImportResponse.Row> result = new ArrayList<>();
        for (var row : rows) {
            if (!row.status().equals("READY")) {
                result.add(display(row, row.status(), row.reason(), false));
                continue;
            }
            if (!selected.contains(row.rowNumber())) {
                result.add(display(row, "NOT_SELECTED", "선택하지 않은 행", false));
                continue;
            }
            try {
                String phone = decryptPhone(row.phoneEncrypted());
                // 별도 서비스의 트랜잭션을 행마다 완료하므로 다른 행의 입력 오류로 이미 성공한 주민을 취소하지 않습니다.
                var saved = registrations.register(actor, propertyId, new ResidentRegistrationRequest(row.requestId(), row.name(), phone, row.unitId(), row.relationType()));
                result.add(display(row, "SUCCESS", "등록 완료", saved.representative()));
            } catch (ResidentRegistrationException exception) {
                if (exception.code().status.is5xxServerError()) throw exception;
                String status = exception.code() == ResidentRegistrationException.Code.DUPLICATE_RESIDENT ? "DUPLICATE" : "ERROR";
                result.add(display(row, status, exception.code().message, false));
            } catch (IllegalArgumentException exception) {
                result.add(display(row, "ERROR", "등록 정보를 다시 확인해주세요.", false));
            }
        }
        return response(batch, result);
    }

    /** 하루가 지난 임시 명부는 매시간 삭제해 업로드 연락처와 이름을 계속 보관하지 않습니다. */
    @Scheduled(fixedDelay = 3_600_000)
    @Transactional
    public void removeExpiredBatches() { batches.deleteExpired(OffsetDateTime.now(clock)); }

    /** 연락처 보안 설정 실패는 행 오류로 버리지 않고 같은 검증 정보로 재시도할 수 있는 장애로 알립니다. */
    private String decryptPhone(String encrypted) {
        if (encrypted == null) return null;
        try {
            return phones.getObject().decrypt(encrypted);
        } catch (BeansException exception) {
            throw new ResidentRegistrationException(ResidentRegistrationException.Code.PHONE_SECURITY_UNAVAILABLE);
        }
    }

    /** 업로드 행은 개별 등록과 같은 연락처 검증을 쓰며 불명확한 세대를 새로 만들거나 주민을 자동 복구하지 않습니다. */
    private ResidentImportRow validate(ResidentExcelReader.InputRow input, Property property, Map<String, UUID> targets, Set<String> contacts) {
        String building = property.isHasBuildings() ? Building.normalizeName(input.building()) : "";
        String unitNumber = input.unitNumber().replaceFirst("호$", "").strip();
        String name = input.name();
        String relation = relation(input.relation());
        UUID unitId = targets.get(key(building, unitNumber));
        String failure = null;
        if (input.invalidCell()) failure = "수식·오류·논리값 셀은 사용할 수 없어요.";
        else if (!property.isHasBuildings() && !input.building().isBlank()) failure = "동이 없는 관리대상이에요. 동 칸을 비워주세요.";
        else if (name.isBlank() || name.codePointCount(0, name.length()) > 50) failure = "이름을 1~50자로 입력해주세요.";
        else if (relation == null) failure = "주민 구분은 소유주·임차인·가족·기타 중 하나로 입력해주세요.";
        else if (unitId == null) failure = "등록된 동·호수를 찾을 수 없어요. 세대 목록을 확인해주세요.";
        ResidentRegistrationService.ProtectedPhone phone = null;
        if (failure == null) {
            try { phone = registrations.protectPhone(input.phone()); }
            catch (IllegalArgumentException exception) { failure = "연락처 형식을 확인해주세요. 앞자리 0도 입력해야 해요."; }
        }
        String status = failure == null ? "READY" : "ERROR";
        String reason = failure == null ? "등록 가능" : failure;
        if (phone != null && failure == null) {
            String identity = name + ":" + phone.hmac();
            if (!contacts.add(identity)) { status = "DUPLICATE"; reason = "파일의 앞선 행과 이름·연락처가 같아요."; }
            else {
                var existing = residents.findByPropertyIdAndNameAndPhoneHmac(property.getId(), name, phone.hmac());
                if (existing.stream().anyMatch(person -> person.getDeletedAt() == null)) { status = "DUPLICATE"; reason = "이름·연락처가 같은 주민이 이미 등록되어 있어요."; }
                else if (!existing.isEmpty()) { status = "ERROR"; reason = "삭제된 명부에 같은 주민이 있어요. 기존 주민을 확인해주세요."; }
            }
        }
        return new ResidentImportRow(input.rowNumber(), UUID.randomUUID(), clip(building), clip(unitNumber), clip(name),
            relation, unitId, phone == null ? null : phone.encrypted(), phone == null ? null : phone.last4(), status, reason);
    }

    private void requireAdmin(UUID actor, UUID propertyId) {
        if (access.getManagementContext(actor, propertyId).role() != PropertyMemberRole.ADMIN) throw new AuthException(AuthErrorCode.ACCESS_DENIED);
    }
    private ResidentImportResponse response(ResidentImportBatch batch, List<ResidentImportResponse.Row> rows) {
        return new ResidentImportResponse(batch.getId(), batch.getExpiresAt(), List.copyOf(rows));
    }
    private ResidentImportResponse.Row display(ResidentImportRow row, String status, String reason, boolean representative) {
        return new ResidentImportResponse.Row(row.rowNumber(), row.building(), row.unitNumber(), row.name(), row.relationType(), row.phoneLast4(), status, reason, representative);
    }
    private String key(String building, String number) { return building + "\u0000" + number; }
    private String clip(String value) { return value == null ? "" : value.substring(0, Math.min(120, value.length())); }
    private String relation(String input) {
        // 비어 있는 주민 구분은 미확인 기타로 저장하고 잘못 입력한 값은 기존처럼 행 오류로 안내합니다.
        if (input == null || input.isBlank()) return "OTHER";
        return switch (input) {
            case "소유주", "소유자", "주인", "OWNER" -> "OWNER";
            case "임차인", "세입자", "TENANT" -> "TENANT";
            case "가족", "FAMILY" -> "FAMILY";
            case "기타", "OTHER" -> "OTHER";
            default -> null;
        };
    }
}
