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
}
