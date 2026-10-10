package com.moahome.server.property.repo;

import java.util.UUID;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import com.moahome.server.property.domain.Property;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PropertyRepository extends JpaRepository<Property, UUID> {
	/** 같은 관리대상의 추가·수정을 직렬화해 중복 검사와 저장 사이에 같은 호수가 생성되지 않게 합니다. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select p from Property p where p.id = :id and p.deletedAt is null")
	Optional<Property> findForUnitUpdate(UUID id);
}
