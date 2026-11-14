package com.moahome.server.notice.service;

import java.io.IOException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import com.moahome.server.config.S3Properties;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/** 기존 S3 클라이언트·버킷 설정을 재사용하며 공지 객체는 profiles와 다른 키 공간에 보관합니다. */
@Service
public class NoticeAssetStorage {
	private final S3Client client;
	private final S3Properties properties;

	public NoticeAssetStorage(ObjectProvider<S3Client> clients, S3Properties properties) {
		this.client = clients.getIfAvailable();
		this.properties = properties;
	}

	private void requireReady() {
		if (client == null || properties.bucket() == null || properties.bucket().isBlank()) {
			throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
		}
	}

	/** 키는 서버가 결정하며 응답 유실 시에도 같은 ID·해시의 객체만 다시 저장합니다. */
	public void put(String key, byte[] bytes, String contentType) {
		requireReady();
		try {
			client.putObject(PutObjectRequest.builder().bucket(properties.bucket()).key(key)
				.contentType(contentType).cacheControl("private, no-store").build(), RequestBody.fromBytes(bytes));
		} catch (SdkException exception) {
			throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
		}
	}

	/** 인증·권한을 확인한 메타데이터의 키만 읽고 예상 크기보다 큰 객체를 반환하지 않습니다. */
	public byte[] read(String key, long size) {
		requireReady();
		try (var response = client.getObject(GetObjectRequest.builder().bucket(properties.bucket()).key(key).build())) {
			byte[] bytes = response.readNBytes(Math.toIntExact(size) + 1);
			if (bytes.length != size) {
				throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
			}
			return bytes;
		} catch (SdkException | IOException exception) {
			throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
		}
	}
}
