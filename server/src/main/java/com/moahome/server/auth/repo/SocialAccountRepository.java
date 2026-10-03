package com.moahome.server.auth.repo;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.moahome.server.auth.domain.SocialAccount;
import com.moahome.server.auth.domain.SocialProvider;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SocialAccountRepository extends JpaRepository<SocialAccount, UUID> {
	@Query("select s from SocialAccount s where s.provider = :provider "
		+ "and s.providerUserId = :providerUserId and s.deletedAt is null")
	Optional<SocialAccount> findActiveIdentity(@Param("provider") SocialProvider provider,
		@Param("providerUserId") String providerUserId);

	List<SocialAccount> findAllByUserIdAndDeletedAtIsNullOrderByProviderAscProviderUserIdAsc(UUID userId);

	/** Serializes concurrent first logins for the same provider identity until the transaction commits. */
	@Query(value = "select true from pg_advisory_xact_lock(hashtextextended(:identity, 0))", nativeQuery = true)
	boolean lockIdentity(@Param("identity") String identity);
}
