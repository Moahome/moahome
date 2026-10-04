const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  LOGIN_CANCELLED: "카카오 로그인을 취소했어요. 다시 시작할 수 있어요.",
  OAUTH_STATE_INVALID: "로그인 시간이 지났거나 요청을 확인할 수 없어요. 다시 로그인해 주세요.",
  OAUTH_PROFILE_INVALID: "카카오 계정 정보를 확인하지 못했어요. 다시 로그인해 주세요.",
  OAUTH_PROVIDER_UNAVAILABLE: "카카오 로그인에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
  ACCOUNT_UNAVAILABLE: "현재 이용할 수 없는 계정이에요.",
  AUTH_SERVICE_UNAVAILABLE: "로그인 서비스를 잠시 이용할 수 없어요. 잠시 후 다시 시도해 주세요.",
  OAUTH_LOGIN_FAILED: "로그인을 완료하지 못했어요. 다시 로그인해 주세요.",
};

/** 서버의 실패 코드만 안내 문구로 바꾸고, URL에서 받은 임의의 오류 원문은 표시하지 않습니다. */
export function getKakaoLoginErrorMessage(code?: string): string | undefined {
  if (!code) {
    return undefined;
  }

  return Object.hasOwn(LOGIN_ERROR_MESSAGES, code)
    ? LOGIN_ERROR_MESSAGES[code]
    : LOGIN_ERROR_MESSAGES.OAUTH_LOGIN_FAILED;
}
