package com.moahome.server.notice.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import com.moahome.server.common.storage.S3Storage;
import com.moahome.server.common.storage.StorageException;

/** 공지의 파일 메타데이터 검증과 오류 정책을 유지하며 S3 호출은 공통 저장소에 위임합니다. */
@Service
public class NoticeAssetStorage {

	private final S3Storage storage;

	public NoticeAssetStorage(S3Storage storage) {
		this.storage = storage;
	}

	/** 키는 서버가 결정하며 응답 유실 시에도 같은 ID·해시의 객체만 다시 저장합니다. */
	public void put(String key, byte[] bytes, String contentType) {
		try {
			storage.put(key, bytes, contentType);
		} catch (StorageException exception) {
			throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
		}
	}

	/** 권한을 확인한 메타데이터의 키만 읽고 크기가 다르거나 객체가 없으면 기존 저장소 장애로 안내합니다. */
	public byte[] read(String key, long size) {
		try {
			byte[] bytes = storage.read(key, Math.toIntExact(size)).bytes();
			if (bytes.length != size) {
				throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
			}
			return bytes;
		} catch (StorageException exception) {
			throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
		}
	}
}
