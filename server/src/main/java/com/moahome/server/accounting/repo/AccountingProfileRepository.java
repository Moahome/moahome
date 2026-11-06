package com.moahome.server.accounting.repo;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.moahome.server.accounting.domain.AccountingProfile;

public interface AccountingProfileRepository extends JpaRepository<AccountingProfile, UUID> {
}
