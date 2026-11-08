package com.moahome.server.user.service;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.moahome.server.config.S3Properties;
import com.moahome.server.user.exception.ProfileImageException;
import com.moahome.server.user.exception.ProfileImageException.Code;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;

@Service
public class ProfileImageStorage {
	private static final Logger LOG = LoggerFactory.getLogger(ProfileImageStorage.class);
	private static final String URL_PREFIX = "/api/users/me/profile-image?v=";
	private static final Pattern REFERENCE = Pattern.compile(Pattern.quote(URL_PREFIX)
	    + "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})");
	private static final int MAX_STORED_BYTES = 2 * 1024 * 1024;
	private final S3Client client;
	private final S3Properties properties;

	public ProfileImageStorage(ObjectProvider<S3Client> clients, S3Properties properties) {
		this.client = clients.getIfAvailable();
		this.properties = properties;
	}

	public void requireReady() {
		if (client == null || properties.bucket() == null || properties.bucket().isBlank()) {
			throw new ProfileImageException(Code.PROFILE_IMAGE_UNAVAILABLE);
		}
	}

	/** DB에는 만료되지 않는 본인 API 참조를 저장하고, S3 키는 인증된 계정 ID와 난수로만 만듭니다. */
	public String upload(UUID userId, byte[] image) {
		requireReady();
		String reference = URL_PREFIX + UUID.randomUUID();
		try {
			client.putObject(PutObjectRequest.builder().bucket(properties.bucket()).key(key(userId, reference))
			    .contentType("image/png").cacheControl("private, no-store").build(), RequestBody.fromBytes(image));
			return reference;
		} catch (SdkException exception) {
			// 응답 유실 시 업로드 성공 여부가 불명확할 수 있어 미확정 객체는 운영 점검 대상입니다.
			throw new ProfileImageException(Code.PROFILE_IMAGE_UNAVAILABLE);
		}
	}

	/** 클라이언트가 키·버킷을 지정할 수 없으며 인증 계정의 현재 사진만 제한된 크기로 읽습니다. */
	public byte[] read(UUID userId, String reference) {
		requireReady();
		String objectKey = key(userId, reference);
		try (ResponseInputStream<GetObjectResponse> response = client.getObject(GetObjectRequest.builder()
		    .bucket(properties.bucket()).key(objectKey).build())) {
			byte[] image = response.readNBytes(MAX_STORED_BYTES + 1);
			if (image.length == 0 || image.length > MAX_STORED_BYTES
			    || !"image/png".equals(response.response().contentType())) {
				throw new ProfileImageException(Code.PROFILE_IMAGE_UNAVAILABLE);
			}
			return image;
		} catch (NoSuchKeyException exception) {
			throw new ProfileImageException(Code.PROFILE_IMAGE_NOT_FOUND);
		} catch (SdkException | IOException exception) {
			throw new ProfileImageException(Code.PROFILE_IMAGE_UNAVAILABLE);
		}
	}

	/** 확정된 DB 상태는 되돌리지 않으며 외부·소셜 이미지 주소는 삭제 대상으로 사용하지 않습니다. */
	public void deleteQuietly(UUID userId, String reference) {
		if (!isManaged(reference)) {
			return;
		}
		try {
			requireReady();
			client.deleteObject(DeleteObjectRequest.builder().bucket(properties.bucket()).key(key(userId, reference)).build());
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
			client.deleteObject(DeleteObjectRequest.builder().bucket(properties.bucket()).key(key(userId, reference)).build());
		} catch (SdkException exception) {
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
