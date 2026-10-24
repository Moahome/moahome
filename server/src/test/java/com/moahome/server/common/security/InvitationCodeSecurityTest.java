package com.moahome.server.common.security;

import java.util.UUID;
import java.util.Map;
import com.moahome.server.config.AccountSecurityProperties;
import com.moahome.server.property.support.RegistrationTestKeys;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class InvitationCodeSecurityTest {
	@Test
	void protectedCodeCannotBeMovedToAnotherPropertyOrInvitationOrTamperedWith() {
		var security = new InvitationCodeSecurity(RegistrationTestKeys.accountProperties());
		UUID property = UUID.randomUUID(), invitation = UUID.randomUUID();
		String code = "R-ABCD-EFGH-JKLM";
		String encrypted = security.encrypt(property, invitation, code);
		assertThat(encrypted).doesNotContain(code);
		assertThat(security.decrypt(property, invitation, encrypted)).isEqualTo(code);
		assertThatThrownBy(() -> security.decrypt(UUID.randomUUID(), invitation, encrypted))
		    .isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> security.decrypt(property, UUID.randomUUID(), encrypted))
		    .isInstanceOf(IllegalArgumentException.class);
		String[] pieces = encrypted.split(":");
		pieces[3] = (pieces[3].startsWith("A") ? "B" : "A") + pieces[3].substring(1);
		assertThatThrownBy(() -> security.decrypt(property, invitation, String.join(":", pieces)))
		    .isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void existingProtectedCodeCanBeReadWithOldKeyAfterRotation() {
		var old = RegistrationTestKeys.accountProperties();
		UUID property = UUID.randomUUID(), invitation = UUID.randomUUID();
		String encrypted = new InvitationCodeSecurity(old).encrypt(property, invitation, "R-ABCD-EFGH-JKLM");
		var rotated = new InvitationCodeSecurity(new AccountSecurityProperties("v2",
		    Map.of("v1", old.encryptionKeys().get("v1"), "v2", RegistrationTestKeys.randomKey()), old.hmacKeyBase64()));
		assertThat(rotated.decrypt(property, invitation, encrypted)).isEqualTo("R-ABCD-EFGH-JKLM");
	}
}
