package com.moahome.server.billing.domain;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import com.moahome.server.property.domain.Unit;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(name="charges")
public class Charge {
    @Id private UUID id;
    @Column(name="property_id", nullable=false) private UUID propertyId;
    @Column(name="billing_period_id", nullable=false) private UUID billingPeriodId;
    @Column(name="unit_id", nullable=false) private UUID unitId;
    @Column(name="building_name_snapshot", nullable=false, length=50) private String buildingName;
    @Column(name="unit_number_snapshot", nullable=false, length=30) private String unitNumber;
    @Column(name="unit_display_name_snapshot", length=50) private String displayName;
    @Column(name="total_amount", nullable=false, precision=15, scale=0) private BigDecimal totalAmount;
    @Column(name="due_date", nullable=false) private LocalDate dueDate;
    @Column(nullable=false, length=20) private String status;
    @Column(name="issued_at", columnDefinition="timestamptz") private OffsetDateTime issuedAt;
    @Column(name="canceled_at", columnDefinition="timestamptz") private OffsetDateTime canceledAt;
    @Column(name="canceled_by") private UUID canceledBy;
    @Column(name="cancellation_reason", length=30) private String cancellationReason;
    @Column(name="created_at", nullable=false, columnDefinition="timestamptz") private OffsetDateTime createdAt;
    @Column(name="updated_at", nullable=false, columnDefinition="timestamptz") private OffsetDateTime updatedAt;
    protected Charge() {}

    /** 세대 표시 정보와 부호 있는 합계를 생성 시 보존하고 이후 세대·설정 정정으로 소급 변경하지 않습니다. */
    public static Charge draft(BillingPeriod period, Unit unit, String buildingName, BigDecimal amount, OffsetDateTime at) {
        if (!period.getPropertyId().equals(unit.getPropertyId()) || amount.scale() != 0
            || amount.abs().compareTo(BigDecimal.valueOf(999_999_999_999_999L)) > 0) throw new IllegalArgumentException("Invalid charge");
        var charge = new Charge();
        charge.id = UUID.randomUUID();
        charge.propertyId = period.getPropertyId();
        charge.billingPeriodId = period.getId();
        charge.unitId = unit.getId();
        charge.buildingName = Objects.requireNonNull(buildingName);
        charge.unitNumber = unit.getUnitNumber();
        charge.displayName = unit.getDisplayName();
        charge.totalAmount = amount;
        charge.dueDate = period.getDefaultDueDate();
        charge.status = "DRAFT";
        charge.createdAt = at;
        charge.updatedAt = at;
        return charge;
    }
    /** 자동 확정은 0원·음수도 허용하며 납부·환급 완료로 판정하지 않습니다. */
    public void issue(OffsetDateTime at) {
        if (!"DRAFT".equals(status)) throw new IllegalStateException("Charge already issued");
        Objects.requireNonNull(at);
        status = "ISSUED";
        issuedAt = at;
        updatedAt = at;
    }

    /** 세대 삭제로 당월 청구만 취소하며 원래 금액·항목·발행 시각과 최초 취소 근거를 보존합니다. */
    public void cancelForUnitDeletion(UUID actor, OffsetDateTime at) {
        cancelCurrentMonth(actor, at, "UNIT_DELETED");
    }

    /** 상세에서 당월 청구만 취소하며 세대·주민·향후 부과 대상은 그대로 유지합니다. */
    public void cancelManually(UUID actor, OffsetDateTime at) {
        cancelCurrentMonth(actor, at, "MANUAL_CANCELED");
    }

    /** 공실은 당월 부과에서 제외하고 사용 중으로 돌아오면 같은 스냅샷으로 복귀시켜 중복 청구를 막습니다. */
    public void applyVacancy(boolean vacant, OffsetDateTime at) {
        if ("CANCELED".equals(status)) return;
        if (!("ISSUED".equals(status) || "EXCLUDED_VACANT".equals(status))) throw new IllegalStateException("Charge is not issued");
        if (!YearMonth.from(dueDate).equals(YearMonth.from(at.atZoneSameInstant(BillingCalendar.ZONE)))) {
            throw new IllegalArgumentException("Only current month eligibility can change");
        }
        String next = vacant ? "EXCLUDED_VACANT" : "ISSUED";
        if (status.equals(next)) return;
        status = next;
        updatedAt = at;
    }

    /** 취소는 원본 삭제 대신 최초 처리자·시각·사유를 남기고 같은 요청의 재시도는 무해하게 처리합니다. */
    private void cancelCurrentMonth(UUID actor, OffsetDateTime at, String reason) {
        if ("CANCELED".equals(status)) return;
        if (!"ISSUED".equals(status) && !("UNIT_DELETED".equals(reason) && "EXCLUDED_VACANT".equals(status))) {
            throw new IllegalStateException("Charge is not issued");
        }
        Objects.requireNonNull(actor);
        Objects.requireNonNull(at);
        if (!YearMonth.from(dueDate).equals(YearMonth.from(at.atZoneSameInstant(BillingCalendar.ZONE)))) {
            throw new IllegalArgumentException("Only current month charges can be canceled for unit deletion");
        }
        status = "CANCELED";
        canceledAt = at;
        canceledBy = actor;
        cancellationReason = reason;
        updatedAt = at;
    }
}
