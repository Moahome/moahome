package com.moahome.server.common.storage;

import java.io.IOException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import com.moahome.server.config.S3Properties;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import com.moahome.server.common.storage.StorageException.Reason;

/** S3 기술 처리만 공유하며 객체 키·권한·파일 검증·삭제 재시도 정책은 호출 업무에 남깁니다. */
@Service
public class S3Storage {

	private final S3Client client;

	private final S3Properties properties;

	public S3Storage(ObjectProvider<S3Client> clients, S3Properties properties) {
		this.client = clients.getIfAvailable();
		this.properties = properties;
	}

	public void requireReady() {
		if (client == null || properties.bucket() == null || properties.bucket().isBlank()) {
			throw new StorageException(Reason.UNAVAILABLE);
		}
	}

	/** 외부 저장은 DB와 함께 롤백되지 않습니다. 응답 유실 시 재시도·미참조 객체 처리는 호출자가 결정합니다. */
	public void put(String key, byte[] bytes, String contentType) {
		requireReady();
		try {
			client.putObject(PutObjectRequest.builder().bucket(properties.bucket()).key(key).contentType(contentType)
			    .cacheControl("private, no-store").build(), RequestBody.fromBytes(bytes));
		} catch (SdkException exception) {
			throw new StorageException(Reason.UNAVAILABLE);
		}
	}

	/** 호출자가 정한 상한보다 한 바이트만 더 읽어 과대 객체를 감지하고 스트림을 항상 닫습니다. */
	public StoredObject read(String key, int maxBytes) {
		if (maxBytes < 0 || maxBytes == Integer.MAX_VALUE) {
			throw new IllegalArgumentException("Invalid storage read limit");
		}
		requireReady();
		try (var response = client.getObject(GetObjectRequest.builder().bucket(properties.bucket()).key(key).build())) {
			byte[] bytes = response.readNBytes(maxBytes + 1);
			if (bytes.length > maxBytes) {
				throw new StorageException(Reason.UNAVAILABLE);
			}
			return new StoredObject(bytes, response.response().contentType());
		} catch (NoSuchKeyException exception) {
			throw new StorageException(Reason.NOT_FOUND);
		} catch (SdkException | IOException exception) {
			throw new StorageException(Reason.UNAVAILABLE);
		}
	}

	/** 실패를 숨기지 않아 호출자가 확정 후 정리와 탈퇴 재시도를 구분할 수 있게 합니다. */
	public void delete(String key) {
		requireReady();
		try {
			client.deleteObject(DeleteObjectRequest.builder().bucket(properties.bucket()).key(key).build());
		} catch (SdkException exception) {
			throw new StorageException(Reason.UNAVAILABLE);
		}
	}

	public record StoredObject(byte[] bytes, String contentType) {
	}
}
