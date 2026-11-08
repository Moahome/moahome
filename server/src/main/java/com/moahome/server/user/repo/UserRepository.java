package com.moahome.server.user.repo;

import java.util.Optional;
import java.util.UUID;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.data.domain.Pageable;

import com.moahome.server.user.domain.User;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, UUID>, JpaSpecificationExecutor<User> {
	Optional<User> findByIdAndDeletedAtIsNull(UUID id);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select u from User u where u.id = :id and u.deletedAt is null")
	Optional<User> findForUpdate(@Param("id") UUID id);

	/** 만료한 유예 계정만 일정한 순서로 조금씩 처리해 전체 사용자를 잠그지 않습니다. */
	@Query("select u.id from User u where u.status = com.moahome.server.user.domain.UserStatus.WITHDRAWAL_PENDING "
	    + "and u.deletedAt is null and u.withdrawalExpiresAt <= :at order by u.withdrawalExpiresAt, u.id")
	List<UUID> findExpiredWithdrawals(OffsetDateTime at, Pageable page);
}
