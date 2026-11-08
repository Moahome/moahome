package com.moahome.server.user.dto;

import org.springframework.web.multipart.MultipartFile;

import com.moahome.server.common.validation.TextInput;
import com.moahome.server.common.validation.TextValues;

/** 사진과 이름을 한 번에 저장하며 임의 사용자 ID·객체 키·이미지 URL은 입력받지 않습니다. */
public record ProfileSaveRequest(@TextInput(max = 50) String displayName, boolean removeImage, MultipartFile image) {
	public ProfileSaveRequest {
		displayName = TextValues.strip(displayName);
	}
}
