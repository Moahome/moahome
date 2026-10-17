package com.moahome.server.membership.repo;
import java.util.*;
import com.moahome.server.membership.domain.MemberInvitation;
import org.springframework.data.jpa.repository.*;
public interface MemberInvitationRepository extends JpaRepository<MemberInvitation,UUID> {
    List<MemberInvitation> findByPropertyIdOrderByCreatedAtDesc(UUID property);
    Optional<MemberInvitation> findByTokenHash(String hash);
    @Query("select i.propertyId from MemberInvitation i where i.tokenHash=:hash")
    Optional<UUID> findPropertyByHash(String hash);
}

