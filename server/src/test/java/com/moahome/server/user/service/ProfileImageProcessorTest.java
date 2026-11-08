package com.moahome.server.user.service;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

import javax.imageio.ImageIO;

import com.moahome.server.user.exception.ProfileImageException;
import com.moahome.server.user.exception.ProfileImageException.Code;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProfileImageProcessorTest {
	private final ProfileImageProcessor processor = new ProfileImageProcessor();

	@Test
	void normalizesPngAndJpegToBoundedPngWithoutOriginalTrailingMetadata() throws Exception {
		for (String format : new String[] { "png", "jpeg" }) {
			ByteArrayOutputStream input = new ByteArrayOutputStream();
			ImageIO.write(new BufferedImage(1024, 768, BufferedImage.TYPE_INT_RGB), format, input);
			input.write("private-original-metadata".getBytes(StandardCharsets.UTF_8));
			byte[] normalized = processor.normalize(new MockMultipartFile("image", "private-name." + format,
			    "image/" + format, input.toByteArray()));
			BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(normalized));
			assertThat(decoded.getWidth()).isEqualTo(512);
			assertThat(decoded.getHeight()).isEqualTo(384);
			assertThat(new String(normalized, StandardCharsets.ISO_8859_1)).doesNotContain("private-original-metadata");
			assertThat(normalized).startsWith((byte) 0x89, (byte) 'P', (byte) 'N', (byte) 'G');
		}
	}

	@Test
	void rejectsSvgCorruptFilesMimeSpoofingEmptyAndOversizedUploads() throws Exception {
		assertCode(new MockMultipartFile("image", "photo.svg", "image/svg+xml", "<svg/>".getBytes()), Code.INVALID_PROFILE_IMAGE);
		assertCode(new MockMultipartFile("image", "photo.png", "image/png", new byte[] { 1, 2, 3 }), Code.INVALID_PROFILE_IMAGE);
		assertCode(new MockMultipartFile("image", new byte[0]), Code.INVALID_PROFILE_IMAGE);
		assertCode(new MockMultipartFile("image", "photo.png", "image/png", new byte[5 * 1024 * 1024 + 1]), Code.PROFILE_IMAGE_TOO_LARGE);
		ByteArrayOutputStream png = new ByteArrayOutputStream();
		ImageIO.write(new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB), "png", png);
		assertCode(new MockMultipartFile("image", "photo.jpg", "image/jpeg", png.toByteArray()), Code.INVALID_PROFILE_IMAGE);
	}

	@Test
	void rejectsExcessivePixelDimensionsEvenWhenCompressedFileIsSmall() throws Exception {
		ByteArrayOutputStream png = new ByteArrayOutputStream();
		ImageIO.write(new BufferedImage(4001, 4000, BufferedImage.TYPE_BYTE_GRAY), "png", png);
		assertThat(png.size()).isLessThan(5 * 1024 * 1024);
		assertCode(new MockMultipartFile("image", "photo.png", "image/png", png.toByteArray()), Code.INVALID_PROFILE_IMAGE);
	}

	private void assertCode(MockMultipartFile file, Code code) {
		assertThatThrownBy(() -> processor.normalize(file)).isInstanceOfSatisfying(ProfileImageException.class,
		    exception -> assertThat(exception.code()).isEqualTo(code));
	}
}
