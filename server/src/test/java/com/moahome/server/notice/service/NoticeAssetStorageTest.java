package com.moahome.server.notice.service;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import com.moahome.server.common.storage.S3Storage;
import com.moahome.server.common.storage.StorageException;
import com.moahome.server.common.storage.StorageException.Reason;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class NoticeAssetStorageTest {

	@Test
	void requiresExactMetadataSizeAndKeepsMissingObjectsAsStorageFailures() {
		S3Storage s3 = mock(S3Storage.class);
		NoticeAssetStorage storage = new NoticeAssetStorage(s3);
		when(s3.read("notice-key", 2)).thenReturn(new S3Storage.StoredObject(new byte[]{1, 2}, "application/pdf"));
		assertThat(storage.read("notice-key", 2)).containsExactly(1, 2);
		when(s3.read("notice-key", 2)).thenReturn(new S3Storage.StoredObject(new byte[]{1}, "application/pdf"));
		assertThatThrownBy(() -> storage.read("notice-key", 2)).isInstanceOf(ResponseStatusException.class);
		when(s3.read("notice-key", 2)).thenThrow(new StorageException(Reason.NOT_FOUND));
		assertThatThrownBy(() -> storage.read("notice-key", 2)).isInstanceOfSatisfying(ResponseStatusException.class,
		    failure -> assertThat(failure.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
	}
}
