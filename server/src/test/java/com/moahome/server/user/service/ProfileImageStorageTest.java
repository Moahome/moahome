package com.moahome.server.user.service;

import java.io.ByteArrayInputStream;
import java.util.UUID;

import com.moahome.server.config.S3Properties;
import com.moahome.server.user.exception.ProfileImageException;
import com.moahome.server.user.exception.ProfileImageException.Code;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;

import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.AbortableInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class ProfileImageStorageTest {
	private final S3Client client = mock(S3Client.class);
	private final UUID userId = UUID.randomUUID();

	@SuppressWarnings("unchecked")
	private ProfileImageStorage storage(S3Client value) {
		ObjectProvider<S3Client> clients = mock(ObjectProvider.class);
		when(clients.getIfAvailable()).thenReturn(value);
		return new ProfileImageStorage(clients, new S3Properties("test-private-bucket", "ap-northeast-2", ""));
	}

	@Test
	void uploadGeneratesPrivateReferenceAndDeleteUsesOnlyTheAuthenticatedUserPrefix() {
		ProfileImageStorage storage = storage(client);
		String reference = storage.upload(userId, new byte[] { 1, 2 });
		ArgumentCaptor<PutObjectRequest> upload = ArgumentCaptor.forClass(PutObjectRequest.class);
		verify(client).putObject(upload.capture(), any(RequestBody.class));
		assertThat(reference).startsWith("/api/users/me/profile-image?v=");
		assertThat(upload.getValue().bucket()).isEqualTo("test-private-bucket");
		assertThat(upload.getValue().key()).startsWith("profiles/" + userId + "/").endsWith(".png");
		assertThat(upload.getValue().acl()).isNull();
		storage.deleteQuietly(userId, reference);
		ArgumentCaptor<DeleteObjectRequest> deleted = ArgumentCaptor.forClass(DeleteObjectRequest.class);
		verify(client).deleteObject(deleted.capture());
		assertThat(deleted.getValue().key()).isEqualTo(upload.getValue().key());
		assertThat(deleted.getValue().bucket()).isEqualTo("test-private-bucket");
	}

	@Test
	void externalOrMalformedReferencesCannotBecomeObjectKeysAndDeletionFailureDoesNotUndoCommittedProfile() {
		ProfileImageStorage storage = storage(client);
		for (String reference : new String[] { "https://example.test/photo.png", "s3://other/key", "/api/users/me/profile-image?v=../other" }) {
			storage.deleteQuietly(userId, reference);
			assertThatThrownBy(() -> storage.read(userId, reference)).isInstanceOf(ProfileImageException.class);
		}
		verifyNoInteractions(client);
		when(client.deleteObject(any(DeleteObjectRequest.class))).thenThrow(S3Exception.builder().statusCode(503).build());
		assertThatCode(() -> storage.deleteQuietly(userId, "/api/users/me/profile-image?v=" + UUID.randomUUID()))
		    .doesNotThrowAnyException();
		assertThatThrownBy(() -> storage(null).upload(userId, new byte[] { 1 }))
		    .isInstanceOfSatisfying(ProfileImageException.class, exception -> assertThat(exception.code()).isEqualTo(Code.PROFILE_IMAGE_UNAVAILABLE));
	}

	@Test
	void imageReadRejectsUnexpectedTypesAndOversizedBodies() {
		ProfileImageStorage storage = storage(client);
		String reference = "/api/users/me/profile-image?v=" + UUID.randomUUID();
		when(client.getObject(any(GetObjectRequest.class))).thenReturn(response("image/png", new byte[] { 1, 2 }));
		assertThat(storage.read(userId, reference)).containsExactly(1, 2);
		when(client.getObject(any(GetObjectRequest.class))).thenReturn(response("text/html", new byte[] { 1 }));
		assertThatThrownBy(() -> storage.read(userId, reference)).isInstanceOf(ProfileImageException.class);
		when(client.getObject(any(GetObjectRequest.class))).thenReturn(response("image/png", new byte[2 * 1024 * 1024 + 1]));
		assertThatThrownBy(() -> storage.read(userId, reference)).isInstanceOf(ProfileImageException.class);
	}

	private ResponseInputStream<GetObjectResponse> response(String type, byte[] bytes) {
		return new ResponseInputStream<>(GetObjectResponse.builder().contentType(type).build(),
		    AbortableInputStream.create(new ByteArrayInputStream(bytes)));
	}
}
