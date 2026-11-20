package com.moahome.server.notice.controller;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import com.moahome.server.auth.security.WebAuthSupport;
import com.moahome.server.config.SecurityProperties;
import com.moahome.server.notice.dto.ResidentNoticeResponse;
import com.moahome.server.notice.service.ResidentNoticeService;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@Tag(name = "주민 공지 열람")
@RequestMapping("/api/notice-access")
public class ResidentNoticeController {

	public static final String COOKIE = "moahome-notice-access";

	private final ResidentNoticeService service;
	private final WebAuthSupport web;
	private final SecurityProperties security;

	public ResidentNoticeController(ResidentNoticeService service, WebAuthSupport web, SecurityProperties security) {
		this.service = service;
		this.web = web;
		this.security = security;
	}

	/** 허용된 웹 Origin의 명시적인 POST에서만 읽기 세션을 발급해 외부 사이트의 쿠키 교체를 막습니다. */
	@PostMapping(value = "/sessions", consumes = MediaType.APPLICATION_JSON_VALUE)
	public ResponseEntity<Void> exchange(@Valid @RequestBody ResidentNoticeResponse.ExchangeRequest body,
	    HttpServletRequest request) {
		web.verifyOrigin(request);
		String token = service.exchange(body.token());
		String cookie = ResponseCookie.from(COOKIE, token).path("/api/notice-access").httpOnly(true)
		    .secure(security.cookieSecure()).sameSite("Lax").maxAge(ResidentNoticeService.SESSION_TTL).build().toString();
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).header(HttpHeaders.SET_COOKIE, cookie)
		    .build();
	}

	@GetMapping("/context")
	@SecurityRequirement(name = "noticeAccessCookie")
	public ResponseEntity<ResidentNoticeResponse.Context> context(HttpServletRequest request) {
		return ok(service.context(session(request)));
	}

	@GetMapping("/notices")
	@SecurityRequirement(name = "noticeAccessCookie")
	public ResponseEntity<ResidentNoticeResponse.Listing> list(HttpServletRequest request,
	    @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "") String query) {
		return ok(service.list(session(request), page, query));
	}

	@GetMapping("/notices/{id}")
	@SecurityRequirement(name = "noticeAccessCookie")
	public ResponseEntity<ResidentNoticeResponse.Detail> detail(HttpServletRequest request, @PathVariable UUID id) {
		return ok(service.detail(session(request), id));
	}

	@GetMapping("/notices/{noticeId}/assets/{assetId}")
	@SecurityRequirement(name = "noticeAccessCookie")
	public ResponseEntity<byte[]> asset(HttpServletRequest request, @PathVariable UUID noticeId,
	    @PathVariable UUID assetId) {
		var download = service.asset(session(request), noticeId, assetId);
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Content-Type-Options", "nosniff")
		    .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
		        .filename(download.asset().name(), StandardCharsets.UTF_8).build().toString())
		    .contentType(MediaType.parseMediaType(download.asset().contentType())).body(download.bytes());
	}

	private String session(HttpServletRequest request) {
		String session = null;
		if (request.getCookies() == null) {
			return null;
		}
		for (Cookie cookie : request.getCookies()) {
			if (COOKIE.equals(cookie.getName())) {
				if (session != null) {
					return null;
				}
				session = cookie.getValue();
			}
		}
		return session;
	}

	private <T> ResponseEntity<T> ok(T value) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value);
	}
}
