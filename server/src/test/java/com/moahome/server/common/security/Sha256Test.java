package com.moahome.server.common.security;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class Sha256Test {

	@Test
	void matchesStandardVectorsWithoutChangingHexEncoding() {
		assertThat(Sha256.hex("")).isEqualTo("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
		assertThat(Sha256.hex("abc")).isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
		assertThat(Sha256.hex("한글 입력")).isEqualTo(Sha256.hex("한글 입력".getBytes(StandardCharsets.UTF_8)));
	}
}
