package com.moahome.server.user.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.moahome.server.user.domain.User;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, UUID> {
	Optional<User> findByIdAndDeletedAtIsNull(UUID id);

	List<User> findAllByPhoneHmacAndDeletedAtIsNull(String phoneHmac);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select u from User u where u.id = :id and u.deletedAt is null")
	Optional<User> findForUpdate(@Param("id") UUID id);
}
