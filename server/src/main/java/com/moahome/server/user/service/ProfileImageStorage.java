package com.moahome.server.user.service;

import java.util.UUID;
import com.moahome.server.common.storage.S3Storage;
import com.moahome.server.common.storage.StorageException;
import com.moahome.server.common.storage.StorageException.Reason;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.moahome.server.user.exception.ProfileImageException;
import com.moahome.server.user.exception.ProfileImageException.Code;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ProfileImageStorage {
	private static final Logger LOG = LoggerFactory.getLogger(ProfileImageStorage.class);

	private static final String URL_PREFIX = "/api/users/me/profile-image?v=";

	private static final Pattern REFERENCE = Pattern
	    .compile(Pattern.quote(URL_PREFIX) + "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})");

	private static final int MAX_STORED_BYTES = 2 * 1024 * 1024;

	private final S3Storage storage;

	public ProfileImageStorage(S3Storage storage) {
		this.storage = storage;
	}

	/** 저장소 준비 오류는 프로필 API의 기존 오류 코드로 변환합니다. */
	public void requireReady() {
		try {
			storage.requireReady();
		} catch (StorageException exception) {
			throw new ProfileImageException(Code.PROFILE_IMAGE_UNAVAILABLE);
		}
	}

	/** DB에는 만료되지 않는 본인 API 참조를 저장하고, S3 키는 인증된 계정 ID와 난수로만 만듭니다. */
	public String upload(UUID userId, byte[] image) {
		requireReady();
		String reference = URL_PREFIX + UUID.randomUUID();
		try {
			storage.put(key(userId, reference), image, "image/png");
			return reference;
		} catch (StorageException exception) {
			// 응답 유실 시 업로드 성공 여부가 불명확할 수 있어 미확정 객체는 운영 점검 대상입니다.
			throw new ProfileImageException(Code.PROFILE_IMAGE_UNAVAILABLE);
		}
	}

	/** 클라이언트가 키·버킷을 지정할 수 없으며 인증 계정의 현재 사진만 제한된 크기로 읽습니다. */
	public byte[] read(UUID userId, String reference) {
		requireReady();
		String objectKey = key(userId, reference);
		try {
			var object = storage.read(objectKey, MAX_STORED_BYTES);
			byte[] image = object.bytes();
			if (image.length == 0 || !"image/png".equals(object.contentType())) {
				throw new ProfileImageException(Code.PROFILE_IMAGE_UNAVAILABLE);
			}
			return image;
		} catch (StorageException exception) {
			throw new ProfileImageException(
			    exception.reason() == Reason.NOT_FOUND ? Code.PROFILE_IMAGE_NOT_FOUND : Code.PROFILE_IMAGE_UNAVAILABLE);
		}
	}

	/** 확정된 DB 상태는 되돌리지 않으며 외부·소셜 이미지 주소는 삭제 대상으로 사용하지 않습니다. */
	public void deleteQuietly(UUID userId, String reference) {
		if (!isManaged(reference)) {
			return;
		}
		try {
			requireReady();
			storage.delete(key(userId, reference));
		} catch (RuntimeException exception) {
			// 원문 파일명·AWS 응답·키·사용자 개인정보는 로그에 포함하지 않습니다.
			LOG.warn("프로필 사진 객체 정리에 실패했습니다. 미참조 객체 점검이 필요합니다.");
		}
	}

	/** 계정 확정 삭제에서는 실패를 호출자에 돌려줘 사진 참조를 보관한 채 다음 배치에서 재시도합니다. */
	public void deleteForAccountWithdrawal(UUID userId, String reference) {
		if (!isManaged(reference)) {
			return;
		}
		requireReady();
		try {
			storage.delete(key(userId, reference));
		} catch (StorageException exception) {
			throw new ProfileImageException(Code.PROFILE_IMAGE_UNAVAILABLE);
		}
	}

	public static boolean isManaged(String reference) {
		return reference != null && REFERENCE.matcher(reference).matches();
	}

	private String key(UUID userId, String reference) {
		Matcher match = REFERENCE.matcher(reference == null ? "" : reference);
		if (!match.matches()) {
			throw new ProfileImageException(Code.PROFILE_IMAGE_NOT_FOUND);
		}
		return "profiles/" + userId + "/" + match.group(1) + ".png";
	}
}
