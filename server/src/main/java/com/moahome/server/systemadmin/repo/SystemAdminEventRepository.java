package com.moahome.server.systemadmin.repo;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.moahome.server.systemadmin.domain.SystemAdminEvent;

public interface SystemAdminEventRepository extends JpaRepository<SystemAdminEvent, UUID> {
}
