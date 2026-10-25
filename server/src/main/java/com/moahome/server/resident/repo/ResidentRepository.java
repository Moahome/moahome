package com.moahome.server.resident.repo;

import java.util.List;
import java.util.UUID;
import com.moahome.server.resident.domain.Resident;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ResidentRepository extends JpaRepository<Resident, UUID> {
	List<Resident> findByPropertyIdAndUserIdAndDeletedAtIsNull(UUID propertyId, UUID userId);

	/** 가입 요청 목록은 승인 상태를 추측하지 않고 실제 계정 미연결 주민 전원을 최소 정보로 조회합니다. */
	@Query(value = """
		select r.id as "residentId", r.name as name, r.phone_last4 as "phoneLast4",
		    b.name as "buildingName", u.unit_number as "unitNumber",
		    case when u.id is not null then ur.relation_type end as "relationType"
		from residents r
		left join unit_residents ur on ur.property_id=r.property_id and ur.resident_id=r.id
		    and ur.status='ACTIVE' and ur.deleted_at is null
		left join units u on u.property_id=r.property_id and u.id=ur.unit_id and u.deleted_at is null
		left join buildings b on b.property_id=r.property_id and b.id=u.building_id and b.deleted_at is null
		where r.property_id=:propertyId and r.deleted_at is null and r.user_id is null
		order by r.name, r.id
		""", nativeQuery = true)
	List<UnlinkedResidentRow> findUnlinkedResidents(UUID propertyId);

	/** 가입 업무에 필요한 마스킹 연락처·현재 소속만 제공하고 계정 ID와 보호 원문은 조회하지 않습니다. */
	interface UnlinkedResidentRow {
		UUID getResidentId();

		String getName();

		String getPhoneLast4();

		String getBuildingName();

		String getUnitNumber();

		String getRelationType();
	}

	java.util.List<Resident> findByPropertyIdAndNameAndPhoneHmac(UUID propertyId, String name, String phoneHmac);

	java.util.Optional<Resident> findByIdAndPropertyId(UUID id, UUID propertyId);

	/** 내보내기에서 해당 대상의 미삭제 주민만 한 번에 읽어 다른 대상의 연락처가 섞이지 않게 합니다. */
	List<Resident> findByPropertyIdAndIdInAndDeletedAtIsNull(UUID propertyId, java.util.Collection<UUID> ids);

	/**
	 * 명부 전체를 주민당 한 행으로 읽고 현재 소속과 가입 상태의 근거를 조회합니다.
	 * 호수·전화번호만으로 사람을 추측하지 않고 확인된 연결과 실제 승인·참여를 사용합니다.
	 */
	String DIRECTORY_QUERY = """
		select r.id as id, r.name as name, r.phone_last4 as "phoneLast4",
		    u.id as "unitId", u.building_id as "buildingId", u.unit_number as "unitNumber",
		    case when u.id is not null then ur.relation_type end as "relationType",
		    (u.id is not null and coalesce(ur.is_household_rep, false)) as representative,
		    (select case when count(distinct m.role)>1 then 'CONFLICT' else min(m.role) end
		     from property_members m where m.property_id=r.property_id and m.user_id=r.user_id
		     and m.status='ACTIVE' and m.ended_at is null and m.deleted_at is null) as "serviceRole",
		    (exists (
		        select 1 from membership_requests approved
		        join property_members member on member.property_id = approved.property_id
		            and member.user_id = approved.user_id and member.status = 'ACTIVE'
		            and member.ended_at is null and member.deleted_at is null
		        where approved.property_id = r.property_id and approved.user_id = r.user_id
		            and approved.unit_id = u.id and approved.status = 'APPROVED'
		            and approved.deleted_at is null
		    ) or exists (
		        -- 최초 등록자의 명시적 거주 선택은 가입 요청을 만들지 않습니다. 원 등록의 주민·세대 관계 ID가 같을 때만 즉시 연결을 인정합니다.
		        select 1 from property_registration_results registration
		        join property_members member on member.property_id=registration.property_id
		            and member.user_id=registration.user_id and member.status='ACTIVE'
		            and member.ended_at is null and member.deleted_at is null
		        where registration.property_id=r.property_id and registration.user_id=r.user_id
		            and registration.response_snapshot->'administrator'->>'residenceType'='RESIDENT'
		            and registration.response_snapshot->'administrator'->>'residentId'=r.id::text
		            and registration.response_snapshot->'administrator'->>'unitId'=u.id::text
		            and registration.response_snapshot->'administrator'->>'unitResidentId'=ur.id::text
		    ) or exists (
		        -- 기존 관리소장의 본인 연결도 당시의 현재 관계 ID와 활성 참여가 같을 때만 가입 완료로 인정합니다.
		        select 1 from resident_account_links link
		        join property_members member on member.property_id=link.property_id
		            and member.user_id=link.user_id and member.status='ACTIVE'
		            and member.ended_at is null and member.deleted_at is null
		        where link.property_id=r.property_id and link.resident_id=r.id
		            and link.user_id=r.user_id and link.unit_resident_id=ur.id and u.id is not null
		    ) or exists (
                -- 개인 초대의 현재 관계·수락 계정과 활성 참여가 일치하는 승인만 인정합니다.
                select 1 from resident_invitations invitation
                join property_members member on member.property_id=invitation.property_id
                    and member.user_id=invitation.requested_by and member.status='ACTIVE'
                    and member.ended_at is null and member.deleted_at is null
                where invitation.property_id=r.property_id and invitation.resident_id=r.id
                    and invitation.requested_by=r.user_id and invitation.unit_resident_id=ur.id
                    and invitation.unit_id=u.id and invitation.status='APPROVED'
            ) or exists (
		        -- 이전 버전에서 이미 승인한 연결은 유지하며 신규 주민 가입에는 초대를 사용하지 않습니다.
		        select 1 from member_invitations legacy
		        join property_members member on member.property_id=legacy.property_id
		            and member.user_id=legacy.requested_by and member.status='ACTIVE'
		            and member.ended_at is null and member.deleted_at is null
		        where legacy.property_id=r.property_id and legacy.resident_id=r.id
		            and legacy.unit_id=u.id and legacy.requested_by=r.user_id
		            and legacy.role='RESIDENT' and legacy.status='APPROVED'
		    )) as approved,
		    (exists (
		        select 1 from membership_requests pending
		        where pending.property_id = r.property_id and pending.matched_resident_id = r.id
		            and pending.unit_id = u.id and pending.status = 'PENDING'
		            and pending.match_status in ('MATCHED', 'MANUAL') and pending.deleted_at is null
		    ) or exists (
                select 1 from resident_invitations invitation
                where invitation.property_id=r.property_id and invitation.resident_id=r.id
                    and invitation.unit_resident_id=ur.id and invitation.unit_id=u.id
                    and invitation.status='CHANGE_REQUESTED'
            )) as pending
		from residents r
		left join unit_residents ur on ur.property_id = r.property_id and ur.resident_id = r.id
		    and ur.status = 'ACTIVE' and ur.deleted_at is null
		left join units u on u.property_id = r.property_id and u.id = ur.unit_id and u.deleted_at is null
		where r.property_id = :propertyId and r.deleted_at is null
		order by r.name, r.id
		""";
	@Query(value = DIRECTORY_QUERY, nativeQuery = true)
	List<DirectoryRow> findDirectory(UUID propertyId);

	/** 명부와 동일한 승인 출처를 재사용하되 현재 계정의 주민 자격 boolean만 반환합니다. */
	@Query(value = "select exists(select 1 from (" + DIRECTORY_QUERY + """
		) directory join residents resident on resident.id=directory.id
		where resident.user_id=:userId and directory.approved)
		""", nativeQuery = true)
	boolean hasApprovedResident(UUID propertyId, UUID userId);

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

		String getServiceRole();
	}
}
