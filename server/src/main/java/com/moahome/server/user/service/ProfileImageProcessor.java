package com.moahome.server.user.service;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Iterator;
import java.util.Locale;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

import com.moahome.server.user.exception.ProfileImageException;
import com.moahome.server.user.exception.ProfileImageException.Code;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ProfileImageProcessor {
	private static final long MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
	private static final long MAX_PIXELS = 16_000_000;
	private static final int MAX_EDGE = 512;

	/** MIME·실제 디코더·픽셀 수를 검사하고 512px PNG로 다시 인코딩해 원본 메타데이터를 저장하지 않습니다. */
	public byte[] normalize(MultipartFile file) {
		if (file == null || file.isEmpty()) {
			throw new ProfileImageException(Code.INVALID_PROFILE_IMAGE);
		}
		if (file.getSize() > MAX_UPLOAD_BYTES) {
			throw new ProfileImageException(Code.PROFILE_IMAGE_TOO_LARGE);
		}
		if (!"image/png".equals(file.getContentType()) && !"image/jpeg".equals(file.getContentType())) {
			throw new ProfileImageException(Code.INVALID_PROFILE_IMAGE);
		}
		try (InputStream input = file.getInputStream(); ImageInputStream stream = ImageIO.createImageInputStream(input)) {
			Iterator<ImageReader> readers = ImageIO.getImageReaders(stream);
			if (!readers.hasNext()) {
				throw new ProfileImageException(Code.INVALID_PROFILE_IMAGE);
			}
			ImageReader reader = readers.next();
			try {
				reader.setInput(stream, true, true);
				String format = reader.getFormatName().toLowerCase(Locale.ROOT);
				if (!(format.equals("png") && file.getContentType().equals("image/png"))
				    && !(format.equals("jpeg") && file.getContentType().equals("image/jpeg"))) {
					throw new ProfileImageException(Code.INVALID_PROFILE_IMAGE);
				}
				int width = reader.getWidth(0);
				int height = reader.getHeight(0);
				// 압축 후 파일이 작아도 거대한 픽셀 버퍼를 만들기 전에 거부합니다.
				if (width < 1 || height < 1 || (long) width * height > MAX_PIXELS) {
					throw new ProfileImageException(Code.INVALID_PROFILE_IMAGE);
				}
				BufferedImage source = reader.read(0);
				double scale = Math.min(1, (double) MAX_EDGE / Math.max(width, height));
				BufferedImage image = new BufferedImage(Math.max(1, (int) Math.round(width * scale)),
				    Math.max(1, (int) Math.round(height * scale)), BufferedImage.TYPE_INT_ARGB);
				Graphics2D graphics = image.createGraphics();
				try {
					graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
					graphics.drawImage(source, 0, 0, image.getWidth(), image.getHeight(), null);
				} finally {
					graphics.dispose();
				}
				ByteArrayOutputStream output = new ByteArrayOutputStream();
				ImageIO.write(image, "png", output);
				return output.toByteArray();
			} finally {
				reader.dispose();
			}
		} catch (IOException | IllegalArgumentException exception) {
			throw new ProfileImageException(Code.INVALID_PROFILE_IMAGE);
		}
	}
}
