package com.moahome.server.systemadmin.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.moahome.server.auth.exception.AuthErrorCode;
import com.moahome.server.auth.exception.AuthException;
import com.moahome.server.systemadmin.domain.SystemAdminEvent;
import com.moahome.server.systemadmin.dto.SystemAdminResponse;
import com.moahome.server.systemadmin.dto.SystemAdminRequests;
import com.moahome.server.systemadmin.exception.SystemAdminException;
import com.moahome.server.systemadmin.repo.SystemAdminEventRepository;
import com.moahome.server.systemadmin.repo.SystemAdminRequestLock;
import com.moahome.server.user.domain.User;
import com.moahome.server.user.domain.SystemRole;
import com.moahome.server.user.repo.UserRepository;

@Service
public class SystemAdminService {
	private final UserRepository users;
	private final SystemAdminEventRepository events;
	private final SystemAdminRequestLock requestLock;
	private final Clock clock;
	private final EntityManager entityManager;

	public SystemAdminService(UserRepository users, SystemAdminEventRepository events,
	    SystemAdminRequestLock requestLock, Clock clock, EntityManager entityManager) {
		this.users = users;
		this.events = events;
		this.requestLock = requestLock;
		this.clock = clock;
		this.entityManager = entityManager;
	}

	/** 현재 DB 역할로 접근을 판단하고 닉네임·계정 UUID 검색을 페이지 단위로 반환합니다. */
	@Transactional(readOnly = true)
	public SystemAdminResponse.Members list(UUID actor, String query, boolean administrators, int page, int size) {
		requireAdministrator(requireUser(actor));
		String keyword = query == null ? "" : query.strip();
		if (keyword.length() > 100 || page < 1 || size < 1 || size > 100)
			throw new SystemAdminException("INVALID_ADMIN_REQUEST", HttpStatus.BAD_REQUEST, "검색 조건을 확인해주세요.");
		String pattern = "%" + keyword.toLowerCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
		UUID exactId = null;
		try {
			exactId = UUID.fromString(keyword);
		} catch (IllegalArgumentException ignored) {
			// 계정 ID가 아니면 닉네임 검색만 적용합니다.
		}
		final UUID selectedId = exactId;
		Specification<User> condition = (root, criteria, builder) -> {
			var visible = builder.isNull(root.get("deletedAt"));
			var name = builder.like(builder.lower(root.get("displayName")), pattern, '\\');
			var searched = selectedId == null ? name : builder.or(name, builder.equal(root.get("id"), selectedId));
			return administrators ? builder.and(visible, searched, builder.equal(root.get("systemRole"), SystemRole.ADMIN))
			    : builder.and(visible, searched);
		};
		Page<User> result = users.findAll(condition,
		    PageRequest.of(page - 1, size, Sort.by(Sort.Order.desc("createdAt"), Sort.Order.asc("id"))));
		return new SystemAdminResponse.Members(result.getContent().stream().map(this::member).toList(),
		    page, size, result.getTotalElements(), Math.max(1, result.getTotalPages()));
	}

	/** 시스템 관리자에게만 회원 식별 정보와 현재 권한을 공개합니다. */
	@Transactional(readOnly = true)
	public SystemAdminResponse.Member get(UUID actor, UUID target) {
		requireAdministrator(requireUser(actor));
		return member(requireUser(target));
	}

	/** 생성 권한과 감사 기록을 원자적으로 저장하고 같은 요청의 재전송은 다시 적용하지 않습니다. */
	@Transactional
	public SystemAdminResponse.Member changePermission(UUID actor, UUID target, SystemAdminRequests.Permission request) {
		User user = lockUsers(actor, target);
		requestLock.acquire(request.requestId());
		String requested = request.allowed().toString();
		if (replayed(request.requestId(), actor, target, "CREATION_PERMISSION", requested, request.expectedAllowed().toString()))
			return member(user);
		if (user.isPropertyCreationAllowed() != request.expectedAllowed())
			throw new SystemAdminException("ADMIN_STATE_CONFLICT", HttpStatus.CONFLICT, "회원 권한이 변경됐습니다. 최신 정보를 확인해주세요.");
		String previous = Boolean.toString(user.isPropertyCreationAllowed());
		user.changePropertyCreationPermission(request.allowed());
		events.save(new SystemAdminEvent(request.requestId(), actor, target, "CREATION_PERMISSION", previous,
		    requested, OffsetDateTime.now(clock)));
		return member(user);
	}

	/** 관리자 승격은 생성 권한을 변경하지 않으며 해제 기능은 제공하지 않습니다. */
	@Transactional
	public SystemAdminResponse.Member promote(UUID actor, UUID target, SystemAdminRequests.Promotion request) {
		User user = lockUsers(actor, target);
		requestLock.acquire(request.requestId());
		if (replayed(request.requestId(), actor, target, "ADMIN_PROMOTION", "ADMIN", null))
			return member(user);
		String previous = user.getSystemRole().name();
		user.promoteToSystemAdministrator();
		events.save(new SystemAdminEvent(request.requestId(), actor, target, "ADMIN_PROMOTION", previous,
		    "ADMIN", OffsetDateTime.now(clock)));
		return member(user);
	}

	/** 교차 권한 변경은 UUID 문자열순 잠금으로 교착을 피하고 등록과 동일한 대상 사용자 행을 잠급니다. */
	private User lockUsers(UUID actor, UUID target) {
		requireAdministrator(requireUser(actor));
		Map<UUID, User> locked = new HashMap<>();
		SortedSet<UUID> ids = new TreeSet<>(Comparator.comparing(UUID::toString));
		ids.add(actor);
		ids.add(target);
		for (UUID id : ids) {
			User user = users.findForUpdate(id).orElseThrow(this::notFound);
			// 같은 요청에서 먼저 읽은 계정도 잠금 대기 뒤에는 현재 역할·허용 여부로 검증합니다.
			entityManager.refresh(user, LockModeType.PESSIMISTIC_WRITE);
			locked.put(id, user);
		}
		requireAdministrator(locked.get(actor));
		User user = locked.get(target);
		user.requireActive();
		return user;
	}

	private boolean replayed(UUID id, UUID actor, UUID target, String action, String requested, String expected) {
		Optional<SystemAdminEvent> previous = events.findById(id);
		if (previous.isEmpty())
			return false;
		if (!previous.get().matches(actor, target, action, requested)
		    || (expected != null && !previous.get().getPreviousValue().equals(expected)))
			throw new SystemAdminException("ADMIN_REQUEST_CONFLICT", HttpStatus.CONFLICT, "이미 다른 내용으로 처리한 요청입니다.");
		return true;
	}

	private User requireUser(UUID id) {
		return users.findByIdAndDeletedAtIsNull(id).orElseThrow(this::notFound);
	}

	private void requireAdministrator(User user) {
		user.requireActive();
		if (user.getSystemRole() != SystemRole.ADMIN)
			throw new AuthException(AuthErrorCode.ACCESS_DENIED);
	}

	private SystemAdminException notFound() {
		return new SystemAdminException("ADMIN_USER_NOT_FOUND", HttpStatus.NOT_FOUND, "회원을 찾을 수 없습니다.");
	}

	private SystemAdminResponse.Member member(User user) {
		return new SystemAdminResponse.Member(user.getId(), user.getDisplayName(), user.getStatus(),
		    user.getSystemRole(), user.isPropertyCreationAllowed(), user.getCreatedAt());
	}
}
