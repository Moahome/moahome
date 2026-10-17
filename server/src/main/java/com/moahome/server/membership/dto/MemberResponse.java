package com.moahome.server.membership.dto;
import java.time.OffsetDateTime;
import java.util.*;
import com.moahome.server.membership.domain.PropertyMemberRole;
public final class MemberResponse {
    private MemberResponse() {}
    public record Member(UUID memberId,String name,UUID residentId,PropertyMemberRole role) {}
    public record Invitation(UUID id,long revision,String status,PropertyMemberRole role,UUID residentId,String residentName,
        String requesterName,OffsetDateTime expiresAt) {}
    public record Workspace(UUID propertyId,List<Member> members,List<Invitation> invitations) {}
    public record Issued(UUID id,String code,OffsetDateTime expiresAt) {
        @Override public String toString() { return "Issued[REDACTED]"; }
    }
    public record Requested(String propertyName,String status) {}
}

