package com.moahome.server.membership.repo;
import java.util.UUID;
import com.moahome.server.membership.domain.MemberRoleEvent;
import org.springframework.data.jpa.repository.JpaRepository;
public interface MemberRoleEventRepository extends JpaRepository<MemberRoleEvent,UUID> {}

