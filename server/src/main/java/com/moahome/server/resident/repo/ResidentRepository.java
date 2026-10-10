package com.moahome.server.resident.repo;

import java.util.List;
import java.util.UUID;
import com.moahome.server.resident.domain.Resident;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ResidentRepository extends JpaRepository<Resident, UUID> {
	java.util.List<Resident> findByPropertyIdAndNameAndPhoneHmac(UUID propertyId, String name, String phoneHmac);
	/**
	 * 명부 전체를 주민당 한 행으로 읽고 현재 소속과 가입 상태의 근거를 조회합니다.
	 * 호수·전화번호만으로 사람을 추측하지 않고 확인된 연결과 실제 승인·참여를 사용합니다.
	 */
	@Query(value = """
		select r.id as id, r.name as name, r.phone_last4 as "phoneLast4",
		    u.id as "unitId", u.building_id as "buildingId", u.unit_number as "unitNumber",
		    case when u.id is not null then ur.relation_type end as "relationType",
		    (u.id is not null and coalesce(ur.is_household_rep, false)) as representative,
		    exists (
		        select 1 from membership_requests approved
		        join property_members member on member.property_id = approved.property_id
		            and member.user_id = approved.user_id and member.status = 'ACTIVE'
		            and member.ended_at is null and member.deleted_at is null
		        where approved.property_id = r.property_id and approved.user_id = r.user_id
		            and approved.unit_id = u.id and approved.status = 'APPROVED'
		            and approved.deleted_at is null
		    ) as approved,
		    exists (
		        select 1 from membership_requests pending
		        where pending.property_id = r.property_id and pending.matched_resident_id = r.id
		            and pending.unit_id = u.id and pending.status = 'PENDING'
		            and pending.match_status in ('MATCHED', 'MANUAL') and pending.deleted_at is null
		    ) as pending
		from residents r
		left join unit_residents ur on ur.property_id = r.property_id and ur.resident_id = r.id
		    and ur.status = 'ACTIVE' and ur.deleted_at is null
		left join units u on u.property_id = r.property_id and u.id = ur.unit_id and u.deleted_at is null
		where r.property_id = :propertyId and r.deleted_at is null
		order by r.name, r.id
		""", nativeQuery = true)
	List<DirectoryRow> findDirectory(UUID propertyId);

	/** 목록에는 끝 네 자리만 조회하여 암호문·전화번호 검색값·계정 ID가 응답 처리에 섞이지 않게 합니다. */
	interface DirectoryRow {
		UUID getId();
		String getName();
		String getPhoneLast4();
		UUID getUnitId();
		UUID getBuildingId();
		String getUnitNumber();
		String getRelationType();
		boolean getRepresentative();
		boolean getApproved();
		boolean getPending();
	}
}
