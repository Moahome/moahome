package com.moahome.server.property.domain;

import java.time.*;
import com.moahome.server.banking.domain.BankAccount;
import com.moahome.server.billing.domain.*;
import com.moahome.server.common.security.AccountNumberSecurity;
import com.moahome.server.membership.domain.*;
import com.moahome.server.property.support.RegistrationTestKeys;
import com.moahome.server.user.domain.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class RegistrationDomainTest {
	private final OffsetDateTime at = OffsetDateTime.parse("2026-10-05T15:00:00Z");

	@Test
	void creatorIsAdminWithoutChangingPlatformRoleAndAllDatesUseRegistrationTime() {
		User user = User.create("등록자", null);
		Property property = Property.create("😀".repeat(50), " 주소 ", " ", null, false, at);
		PropertyMember member = PropertyMember.creator(property, user, at);
		assertThat(member.getRole()).isEqualTo(PropertyMemberRole.ADMIN);
		assertThat(member.getStatus()).isEqualTo(PropertyMemberStatus.ACTIVE);
		assertThat(member.getJoinedAt()).isEqualTo(at);
		assertThat(user.getSystemRole()).isEqualTo(SystemRole.USER);
		assertThat(property.getAddress()).isEqualTo("주소");
		assertThat(property.getAddressDetail()).isNull();
		assertThat(property.getCreatedAt()).isEqualTo(at);
		assertThatThrownBy(() -> Property.create("😀".repeat(51), "주소", null, null, false, at))
			.isInstanceOf(IllegalArgumentException.class);
		user.suspend();
		assertThatThrownBy(() -> PropertyMember.creator(property, user, at)).isInstanceOf(RuntimeException.class);
	}

	@Test
	void unitsRequireMatchingBuildingAndSmallintFloor() {
		Property property = Property.create("동 있음", "주소", null, null, true, at);
		Property other = Property.create("다른 대상", "주소", null, null, true, at);
		Building building = Building.create(property, "101동", 0, at);
		assertThat(Unit.create(property, building, "101", null, -32768, UnitStatus.ACTIVE, at).getFloor())
			.isEqualTo((short)-32768);
		assertThat(Unit.create(property, building, "102", null, 32767, UnitStatus.VACANT, at).getFloor())
			.isEqualTo((short)32767);
		assertThatThrownBy(() -> Unit.create(other, building, "101", null, 1, UnitStatus.ACTIVE, at))
			.isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> Unit.create(property, null, "101", null, null, UnitStatus.ACTIVE, at))
			.isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> Unit.create(property, building, "101", null, 32768, UnitStatus.ACTIVE, at))
			.isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void normalizesBuildingNamesAndPreservesTextUnitIdentifiers() {
		Property property = Property.create("동 있음", "주소", null, null, true, at);
		Building building = Building.create(property, " 101 ", 0, at);
		assertThat(building.getName()).isEqualTo("101동");
		assertThat(Building.create(property, "A", 1, at).getName()).isEqualTo("A동");
		assertThat(Building.create(property, "101동", 2, at).getName()).isEqualTo("101동");
		assertThat(Unit.create(property, building, "001", null, null, UnitStatus.ACTIVE, at).getUnitNumber())
			.isEqualTo("001");
		for (String number : new String[] {"A101", "101호", "B01", "관리실", "001"}) {
			assertThat(Unit.create(property, building, number, null, null, UnitStatus.ACTIVE, at).getUnitNumber())
				.isEqualTo(number);
		}
		assertThatThrownBy(() -> Unit.create(property, building, "101", null, null, UnitStatus.INACTIVE, at))
			.isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void initialAccountAndTemplatePreserveDefaultsAndExactMoney() {
		Property property = Property.create("동 없음", "주소", null, null, false, at);
		var security = new AccountNumberSecurity(RegistrationTestKeys.accountProperties());
		BankAccount account = BankAccount.createPublic(property, "BANK", "은행", "예금주",
			security.protect("00012345678"), true, at);
		assertThat(account.getValidFrom()).isEqualTo(LocalDate.of(2026, 10, 6));
		assertThat(account.getBuildingId()).isNull();
		assertThat(account.getHolderResidentId()).isNull();
		assertThat(account.getGlAccountId()).isNull();
		FeeTemplate template = FeeTemplate.createDefault(property.getId(), at);
		assertThat(template.getName()).isEqualTo("기본 관리비");
		assertThat(template.isDefaultTemplate()).isTrue();
		assertThat(template.getEffectiveFrom()).isNull();
		assertThat(FeeTemplateItem.create(template, "0원 항목", 0, 0, at).getDefaultAmount()).isZero();
		assertThat(FeeTemplateItem.create(template, "상한", 999_999_999_999_999L, 1, at).getDefaultAmount())
			.isEqualByComparingTo("999999999999999");
		assertThatThrownBy(() -> FeeTemplateItem.create(template, "음수", -1, 0, at))
			.isInstanceOf(IllegalArgumentException.class);
	}
}
