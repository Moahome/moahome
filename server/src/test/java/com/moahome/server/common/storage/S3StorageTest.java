package com.moahome.server.common.storage;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import com.moahome.server.config.S3Properties;
import com.moahome.server.common.storage.StorageException.Reason;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.http.AbortableInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class S3StorageTest {

	private final S3Client client = mock(S3Client.class);

	@SuppressWarnings("unchecked")
	private S3Storage storage(S3Client value, String bucket) {
		ObjectProvider<S3Client> clients = mock(ObjectProvider.class);
		when(clients.getIfAvailable()).thenReturn(value);
		return new S3Storage(clients, new S3Properties(bucket, "ap-northeast-2", ""));
	}

	@Test
	void closesStreamsAndBoundsReadsEvenWhenTheObjectIsTooLarge() {
		AtomicBoolean closed = new AtomicBoolean();
		ByteArrayInputStream stream = new ByteArrayInputStream(new byte[100]) {
			@Override
			public void close() throws IOException {
				closed.set(true);
				super.close();
			}
		};
		when(client.getObject(any(GetObjectRequest.class))).thenReturn(new ResponseInputStream<>(
		    GetObjectResponse.builder().contentType("image/png").build(), AbortableInputStream.create(stream)));
		assertThatThrownBy(() -> storage(client, "test-bucket").read("test-key", 3)).isInstanceOfSatisfying(
		    StorageException.class, failure -> assertThat(failure.reason()).isEqualTo(Reason.UNAVAILABLE));
		assertThat(closed).isTrue();
		assertThat(stream.available()).isEqualTo(96);
	}

	@Test
	void separatesMissingObjectsFromUnavailableStorageWithoutExposingSdkMessages() {
		S3Storage storage = storage(client, "test-bucket");
		when(client.getObject(any(GetObjectRequest.class)))
		    .thenThrow(NoSuchKeyException.builder().message("internal-key").build());
		assertThatThrownBy(() -> storage.read("test-key", 10))
		    .isInstanceOfSatisfying(StorageException.class,
		        failure -> assertThat(failure.reason()).isEqualTo(Reason.NOT_FOUND))
		    .hasMessageNotContaining("internal-key");
		when(client.getObject(any(GetObjectRequest.class)))
		    .thenThrow(S3Exception.builder().statusCode(503).message("internal-sdk-detail").build());
		assertThatThrownBy(() -> storage.read("test-key", 10))
		    .isInstanceOfSatisfying(StorageException.class,
		        failure -> assertThat(failure.reason()).isEqualTo(Reason.UNAVAILABLE))
		    .hasMessageNotContaining("internal-sdk-detail");
		assertThatThrownBy(() -> storage(null, "test-bucket").requireReady()).isInstanceOf(StorageException.class);
		assertThatThrownBy(() -> storage(client, " ").requireReady()).isInstanceOf(StorageException.class);
	}
}
