package com.moahome.server.user.service;

import java.util.UUID;

import com.moahome.server.user.domain.User;
import com.moahome.server.user.dto.CurrentUserResponse;
import com.moahome.server.user.dto.ProfileSaveRequest;
import com.moahome.server.user.dto.ProfileSaveResult;
import com.moahome.server.user.exception.ProfileImageException;
import com.moahome.server.user.exception.ProfileImageException.Code;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class ProfileImageService {
	private static final Logger LOG = LoggerFactory.getLogger(ProfileImageService.class);
	private final UserService users;
	private final ProfileImageStorage storage;
	private final ProfileImageProcessor processor;

	public ProfileImageService(UserService users, ProfileImageStorage storage, ProfileImageProcessor processor) {
		this.users = users;
		this.storage = storage;
		this.processor = processor;
	}

	/** 다른 계정·과거 버전의 요청값 대신 인증 계정의 현재 DB 참조만 읽습니다. */
	@Transactional(readOnly = true)
	public byte[] read(UUID userId) {
		User user = users.requireActive(userId);
		if (!ProfileImageStorage.isManaged(user.getProfileImageUrl())) {
			throw new ProfileImageException(Code.PROFILE_IMAGE_NOT_FOUND);
		}
		return storage.read(userId, user.getProfileImageUrl());
	}

	/** 새 객체 업로드 → 계정 잠금 아래 이름·사진 저장 → 커밋 후 이전 객체 정리 순서를 보장합니다. */
	@Transactional
	public CurrentUserResponse save(UUID userId, ProfileSaveRequest request) {
		users.requireActive(userId);
		if (request.image() != null && request.removeImage()) {
			throw new ProfileImageException(Code.INVALID_PROFILE_IMAGE);
		}
		boolean replaceImage = request.image() != null || request.removeImage();
		String reference = null;
		if (request.image() != null) {
			reference = storage.upload(userId, processor.normalize(request.image()));
			registerUploadRollback(userId, reference);
		}
		ProfileSaveResult saved = users.saveProfile(userId, request.displayName(), reference, replaceImage);
		if (replaceImage) {
			registerPreviousImageCleanup(userId, saved.previousImageUrl());
		}
		return saved.user();
	}

	/** 확실한 롤백에서만 새 객체를 정리합니다. 커밋 결과가 불명확하면 참조 중인 사진을 지우지 않습니다. */
	private void registerUploadRollback(UUID userId, String reference) {
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCompletion(int status) {
				if (status == STATUS_ROLLED_BACK) {
					storage.deleteQuietly(userId, reference);
				} else if (status == STATUS_UNKNOWN) {
					LOG.warn("프로필 사진 저장의 커밋 결과가 불명확합니다. 객체 참조 점검이 필요합니다.");
				}
			}
		});
	}

	/** 이전 객체는 DB 커밋 뒤에만 지워서 저장 실패 시 기존 사진을 계속 사용할 수 있게 합니다. */
	private void registerPreviousImageCleanup(UUID userId, String previousImageUrl) {
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				storage.deleteQuietly(userId, previousImageUrl);
			}
		});
	}
}
