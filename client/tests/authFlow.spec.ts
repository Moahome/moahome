import { expect, test, type BrowserContext, type Route } from "@playwright/test";

const API_ORIGIN = "http://localhost:8080";

/** 실제 서버 대신 쿠키가 필요한 인증 응답을 제공하여 로그인 화면의 결과를 검증합니다. */
async function fulfillJson(route: Route, body: unknown, status = 200, cookie?: string) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "Access-Control-Allow-Origin": "http://localhost:3100",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "X-CSRF-TOKEN, Authorization",
      "Cache-Control": "no-store",
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** 브라우저만 읽고 전송할 수 있는 Refresh 쿠키를 테스트 세션에 설정합니다. */
async function addRefreshCookie(context: BrowserContext) {
  await context.addCookies([{
    name: "moahome-refresh",
    value: "test-refresh",
    domain: "localhost",
    path: "/api/auth/web",
    httpOnly: true,
    sameSite: "Lax",
    secure: false,
  }]);
}

function accessResponse() {
  return {
    accessToken: "test-access-memory-only",
    tokenType: "Bearer",
    accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
}

function currentUserResponse() {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    displayName: "모아 주민",
    profileImageUrl: null,
    systemRole: "USER",
    status: "ACTIVE",
  };
}

test.beforeEach(async ({ context }) => {
  // 공개 화면의 전역 초기화도 실제 서버를 호출하지 않도록 기본 비로그인 응답을 제공합니다.
  await context.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    await fulfillJson(route, { code: "AUTHENTICATION_REQUIRED" }, 401);
  });
  await context.route(`${API_ORIGIN}/api/users/me`, async (route) => {
    expect(route.request().headers().authorization).toBe("Bearer test-access-memory-only");
    await fulfillJson(route, currentUserResponse());
  });
});

test("카카오 버튼은 서버 로그인 시작 주소로 이동", async ({ page }) => {
  await page.route(`${API_ORIGIN}/oauth2/authorization/kakao`, async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ contentType: "text/html", body: "<p>OAuth 시작</p>" });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "카카오로 시작하기" }).click();
  await expect(page).toHaveURL(`${API_ORIGIN}/oauth2/authorization/kakao`);
});

test("로그인 취소와 알 수 없는 실패 코드는 안전한 안내 문구로 표시", async ({ page }) => {
  await page.goto("/login?error=LOGIN_CANCELLED");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("카카오 로그인을 취소했어요.");
  await page.goto("/login?error=untrusted-error-detail");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("다시 로그인해 주세요.");
  await expect(page.getByRole("main")).not.toContainText("untrusted-error-detail");
});

test("콜백은 전역 조회를 공유해 시작 화면으로 이동하고 시작 화면 새로고침 후 다시 조회", async ({ page, context }) => {
  await addRefreshCookie(context);
  const requests: string[] = [];
  await page.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    const request = route.request();
    expect(await request.headerValue("cookie")).toContain("moahome-refresh=");
    expect(await request.headerValue("origin")).toBe("http://localhost:3100");

    if (request.url().endsWith("/csrf")) {
      requests.push("csrf");
      await fulfillJson(route, { csrfToken: "test-csrf" });
      return;
    }

    requests.push("refresh");
    expect(request.method()).toBe("POST");
    expect(request.headers()["x-csrf-token"]).toBe("test-csrf");
    expect(request.postData()).toBeNull();
    await fulfillJson(route, accessResponse(), 200, "moahome-refresh=test-rotated; Path=/api/auth/web; HttpOnly; SameSite=Lax");
  });
  await page.route(`${API_ORIGIN}/api/users/me`, async (route) => {
    requests.push("me");
    expect(route.request().headers().authorization).toBe("Bearer test-access-memory-only");
    await fulfillJson(route, currentUserResponse());
  });

  await page.goto("/login/callback");
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole("heading", { name: "모아홈을 시작해 보세요!" })).toBeVisible();
  await expect(page.getByLabel("모아 주민님 계정 정보")).toBeVisible();
  expect(requests).toEqual(["csrf", "refresh", "me"]);
  const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie }));
  expect(JSON.stringify(storage)).not.toContain("test-access-memory-only");
  expect(storage.cookies).not.toContain("moahome-refresh");
  await page.reload();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole("heading", { name: "모아홈을 시작해 보세요!" })).toBeVisible();
  await expect(page.getByLabel("모아 주민님 계정 정보")).toBeVisible();
  expect(requests).toEqual(["csrf", "refresh", "me", "csrf", "refresh", "me"]);
});

test("CSRF 응답을 기다리는 동안 로그인 처리 중 상태 표시", async ({ page }) => {
  let releaseResponse: () => void = () => {};
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    if (route.request().url().endsWith("/csrf")) {
      await responseGate;
      await fulfillJson(route, { csrfToken: "test-csrf" });
      return;
    }
    await fulfillJson(route, accessResponse());
  });

  await page.goto("/login/callback");
  await expect(page.getByRole("heading", { name: "로그인하고 있어요" })).toBeVisible();
  await expect(page.locator("section")).toHaveAttribute("aria-busy", "true");
  releaseResponse();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole("heading", { name: "모아홈을 시작해 보세요!" })).toBeVisible();
});

test("모바일 사이드 메뉴에서 로그아웃하면 쿠키를 제거하고 시작 화면 재진입 차단", async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await addRefreshCookie(context);
  let loggedOut = false;
  await context.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    const request = route.request();

    if (loggedOut) {
      await fulfillJson(route, { code: "AUTHENTICATION_REQUIRED" }, 401);
      return;
    }

    if (request.url().endsWith("/csrf")) {
      await fulfillJson(route, { csrfToken: "test-csrf" });
      return;
    }

    if (request.url().endsWith("/logout")) {
      expect(request.method()).toBe("POST");
      expect(request.headers()["x-csrf-token"]).toBe("test-csrf");
      loggedOut = true;
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "http://localhost:3100",
          "Access-Control-Allow-Credentials": "true",
          "Set-Cookie": "moahome-refresh=; Path=/api/auth/web; Max-Age=0; HttpOnly; SameSite=Lax",
        },
      });
      return;
    }

    await fulfillJson(route, accessResponse());
  });

  await page.goto("/start");
  await page.getByRole("button", { name: "모아 주민님 메뉴 열기" }).click();
  await expect(page.getByRole("dialog", { name: "메뉴", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
  expect(loggedOut).toBe(true);
  expect((await context.cookies()).some((cookie) => cookie.name === "moahome-refresh")).toBe(false);
  await page.goto("/start");
  await expect(page).toHaveURL(/\/login$/);
});

test("로그아웃 장애는 프로필 메뉴에 재시도 안내를 표시하고 시작 화면 유지", async ({ page }) => {
  await page.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/logout")) {
      await fulfillJson(route, { code: "AUTH_SERVICE_UNAVAILABLE" }, 503);
      return;
    }

    await fulfillJson(route, path.endsWith("/csrf") ? { csrfToken: "test-csrf" } : accessResponse());
  });

  await page.goto("/start");
  await page.getByLabel("모아 주민님 계정 정보").click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("로그아웃하지 못했어요.");
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole("button", { name: "로그아웃", exact: true })).toBeEnabled();
});

test("쿠키가 없으면 재발급 없이 재로그인 안내", async ({ page }) => {
  const requests: string[] = [];
  await page.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    requests.push(route.request().url());
    await fulfillJson(route, { code: "AUTHENTICATION_REQUIRED", message: "인증이 필요합니다." }, 401);
  });

  await page.goto("/login/callback");
  await expect(page.getByRole("alert", { name: "로그인을 확인해 주세요" })).toContainText("다시 로그인해 주세요.");
  await expect(page.getByRole("link", { name: "로그인 화면으로" })).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시도" })).toHaveCount(0);
  expect(requests).toHaveLength(1);
});

test("재발급 서비스의 503은 자동 반복 없이 사용자가 재시도", async ({ page }) => {
  let refreshAttempts = 0;
  await page.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    if (route.request().url().endsWith("/csrf")) {
      await fulfillJson(route, { csrfToken: "test-csrf" });
      return;
    }
    refreshAttempts += 1;
    if (refreshAttempts === 1) {
      await fulfillJson(route, { code: "AUTH_SERVICE_UNAVAILABLE", message: "일시 장애" }, 503);
      return;
    }
    await fulfillJson(route, accessResponse());
  });

  await page.goto("/login/callback");
  await expect(page.getByRole("alert", { name: "로그인을 확인해 주세요" })).toContainText("잠시 후 다시 시도해 주세요.");
  expect(refreshAttempts).toBe(1);
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole("heading", { name: "모아홈을 시작해 보세요!" })).toBeVisible();
  expect(refreshAttempts).toBe(2);
});

test("재발급 응답 유실과 잘못된 토큰 응답은 재로그인 필요", async ({ page }) => {
  let refreshAttempts = 0;
  await page.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    if (route.request().url().endsWith("/csrf")) {
      await fulfillJson(route, { csrfToken: "test-csrf" });
      return;
    }
    refreshAttempts += 1;
    await route.abort("failed");
  });

  await page.goto("/login/callback");
  await expect(page.getByRole("alert", { name: "로그인을 확인해 주세요" })).toContainText("다시 로그인해 주세요.");
  await expect(page.getByRole("button", { name: "다시 시도" })).toHaveCount(0);
  expect(refreshAttempts).toBe(1);

  await page.unroute(`${API_ORIGIN}/api/auth/web/**`);
  await page.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    await fulfillJson(route, route.request().url().endsWith("/csrf") ? { csrfToken: "test-csrf" } : { accessToken: "" });
  });
  await page.reload();
  await expect(page.getByRole("alert", { name: "로그인을 확인해 주세요" })).toContainText("다시 로그인해 주세요.");
  await expect(page.getByRole("button", { name: "다시 시도" })).toHaveCount(0);
});

test("두 탭은 쿠키 교체가 끝난 뒤 다음 CSRF 조회를 실행", async ({ context }) => {
  await addRefreshCookie(context);
  const requests: string[] = [];
  let releaseFirstRefresh: () => void = () => {};
  const refreshGate = new Promise<void>((resolve) => { releaseFirstRefresh = resolve; });
  await context.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    const request = route.request();
    if (request.url().endsWith("/csrf")) {
      requests.push("csrf");
      if (requests.length > 1) {
        expect(await request.headerValue("cookie")).toContain("moahome-refresh=test-rotated");
      }
      await fulfillJson(route, { csrfToken: "test-csrf" });
      return;
    }
    requests.push("refresh");
    if (requests.length === 2) {
      await refreshGate;
    }
    await fulfillJson(route, accessResponse(), 200, "moahome-refresh=test-rotated; Path=/api/auth/web; HttpOnly; SameSite=Lax");
  });

  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto("/login/callback");
  await expect.poll(() => requests.length).toBe(2);
  await second.goto("/login/callback");
  await expect(second.getByRole("heading", { name: "로그인하고 있어요" })).toBeVisible();
  const locks = await second.evaluate(() => navigator.locks.query());
  expect(locks.held).toHaveLength(1);
  await expect.poll(async () => (await second.evaluate(() => navigator.locks.query())).pending?.length).toBe(1);
  expect(requests).toEqual(["csrf", "refresh"]);
  releaseFirstRefresh();
  await expect(first).toHaveURL(/\/start$/);
  await expect(second).toHaveURL(/\/start$/);
  expect(requests).toEqual(["csrf", "refresh", "csrf", "refresh"]);
});

test("모바일 시작 화면은 긴 닉네임에도 가로로 넘치지 않음", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    await fulfillJson(route, route.request().url().endsWith("/csrf") ? { csrfToken: "test-csrf" } : accessResponse());
  });
  await page.route(`${API_ORIGIN}/api/users/me`, async (route) => {
    await fulfillJson(route, { ...currentUserResponse(), displayName: "모".repeat(50) });
  });
  await page.goto("/login/callback");
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole("heading", { name: "모아홈을 시작해 보세요!" })).toBeVisible();
  await expect(page.getByRole("button", { name: `${"모".repeat(50)}님 메뉴 열기` })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: `${"모".repeat(50)}님 메뉴 열기` }).click();
  const menu = page.getByRole("dialog", { name: "메뉴", exact: true });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: "로그아웃", exact: true })).toBeVisible();
  expect(await menu.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("startMobileLongName.png") });
});

test("모바일 사이드 메뉴는 닫기·바깥 영역·Escape·데스크톱 전환 시 닫히고 스크롤 복구", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    await fulfillJson(route, route.request().url().endsWith("/csrf") ? { csrfToken: "test-csrf" } : accessResponse());
  });
  await page.goto("/start");
  const trigger = page.getByRole("button", { name: "모아 주민님 메뉴 열기" });
  const menu = page.getByRole("dialog", { name: "메뉴", exact: true });

  await expect(page.getByRole("button", { name: "알림", exact: true })).toHaveCount(1);
  await trigger.click();
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: "알림", exact: true })).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(menu.getByRole("button", { name: "메뉴 닫기", exact: true })).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await menu.getByRole("button", { name: "메뉴 닫기", exact: true }).click();
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.click();
  await menu.getByRole("button", { name: "메뉴 바깥 영역을 눌러 닫기" }).click({ position: { x: 10, y: 100 } });
  await expect(menu).not.toBeVisible();

  await trigger.click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(menu).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
  await expect(page.getByLabel("모아 주민님 계정 정보")).toBeVisible();
});

test("랜딩에서 전역 복원하고 화면 이동·포커스 전환은 복원과 내 정보 조회를 반복하지 않음", async ({ page }) => {
  const requests: string[] = [];
  await page.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    const action = route.request().url().endsWith("/csrf") ? "csrf" : "refresh";
    requests.push(action);
    await fulfillJson(route, action === "csrf" ? { csrfToken: "test-csrf" } : accessResponse());
  });
  await page.route(`${API_ORIGIN}/api/users/me`, async (route) => {
    requests.push("me");
    await fulfillJson(route, currentUserResponse());
  });

  await page.goto("/");
  await expect.poll(() => requests).toEqual(["csrf", "refresh", "me"]);
  await page.getByRole("link", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("link", { name: "서비스 소개 보기" }).click();
  await expect(page).toHaveURL(/\/#service$/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "로그인", exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  expect(requests).toEqual(["csrf", "refresh", "me"]);
});

test("비로그인 상태에서도 공개 화면을 표시하고 화면 이동 시 인증 실패를 자동 재시도하지 않음", async ({ page }) => {
  let csrfRequests = 0;
  await page.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    csrfRequests += 1;
    await fulfillJson(route, { code: "AUTHENTICATION_REQUIRED" }, 401);
  });

  await page.goto("/");
  await expect.poll(() => csrfRequests).toBe(1);
  await page.getByRole("link", { name: "로그인", exact: true }).click();
  await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
  await page.getByRole("link", { name: "서비스 소개 보기" }).click();
  await expect(page).toHaveURL(/\/#service$/);
  expect(csrfRequests).toBe(1);
});

test("내 정보 조회가 끝나기 전에는 시작 화면으로 이동하지 않음", async ({ page }) => {
  let releaseUser: () => void = () => {};
  const userGate = new Promise<void>((resolve) => { releaseUser = resolve; });
  await page.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    await fulfillJson(route, route.request().url().endsWith("/csrf") ? { csrfToken: "test-csrf" } : accessResponse());
  });
  await page.route(`${API_ORIGIN}/api/users/me`, async (route) => {
    await userGate;
    await fulfillJson(route, currentUserResponse());
  });

  await page.goto("/login/callback");
  await expect(page.getByRole("heading", { name: "로그인하고 있어요" })).toBeVisible();
  await expect(page).toHaveURL(/\/login\/callback$/);
  await expect(page.getByRole("heading", { name: "모아홈을 시작해 보세요!" })).toHaveCount(0);
  releaseUser();
  await expect(page.getByLabel("모아 주민님 계정 정보")).toBeVisible();
});

test("내 정보 조회 장애를 재시도하면 유효한 토큰을 재사용하고 내 정보만 다시 요청", async ({ page }) => {
  let refreshAttempts = 0;
  let userAttempts = 0;
  await page.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    if (route.request().url().endsWith("/csrf")) {
      await fulfillJson(route, { csrfToken: "test-csrf" });
      return;
    }
    refreshAttempts += 1;
    await fulfillJson(route, accessResponse());
  });
  await page.route(`${API_ORIGIN}/api/users/me`, async (route) => {
    userAttempts += 1;
    if (userAttempts === 1) {
      await fulfillJson(route, { code: "AUTH_SERVICE_UNAVAILABLE" }, 503);
      return;
    }
    await fulfillJson(route, currentUserResponse());
  });

  await page.goto("/login/callback");
  await expect(page.getByRole("alert", { name: "로그인을 확인해 주세요" })).toContainText("잠시 후 다시 시도해 주세요.");
  expect(userAttempts).toBe(1);
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByLabel("모아 주민님 계정 정보")).toBeVisible();
  expect(refreshAttempts).toBe(1);
  expect(userAttempts).toBe(2);
});

for (const failure of [
  { name: "계정 이용 불가", body: { code: "ACCOUNT_UNAVAILABLE" }, status: 403, message: "현재 이용할 수 없는 계정이에요." },
  { name: "잘못된 사용자 응답", body: { displayName: "닉네임만 있는 응답" }, status: 200, message: "다시 로그인해 주세요." },
]) {
  test(`내 정보 조회 실패 (${failure.name}) 시 시작 화면으로 이동하지 않음`, async ({ page }) => {
    let userAttempts = 0;
    await page.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
      await fulfillJson(route, route.request().url().endsWith("/csrf") ? { csrfToken: "test-csrf" } : accessResponse());
    });
    await page.route(`${API_ORIGIN}/api/users/me`, async (route) => {
      userAttempts += 1;
      await fulfillJson(route, failure.body, failure.status);
    });

    await page.goto("/login/callback");
    await expect(page.getByRole("alert", { name: "로그인을 확인해 주세요" })).toContainText(failure.message);
    await expect(page).toHaveURL(/\/login\/callback$/);
    await expect(page.getByRole("heading", { name: "모아홈을 시작해 보세요!" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "다시 시도" })).toHaveCount(0);
    expect(userAttempts).toBe(1);
  });
}

test("시작 화면에 직접 진입한 비로그인 사용자는 시작 화면 없이 로그인 화면으로 이동", async ({ page }) => {
  const requests: string[] = [];
  let releaseResponse: () => void = () => {};
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    requests.push(route.request().url());
    await responseGate;
    await fulfillJson(route, { code: "AUTHENTICATION_REQUIRED" }, 401);
  });

  await page.goto("/start");
  await expect(page.getByRole("status")).toContainText("로그인 정보를 확인하고 있어요.");
  await expect(page.getByRole("heading", { name: "모아홈을 시작해 보세요!" })).toHaveCount(0);
  releaseResponse();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "모아홈을 시작해 보세요!" })).toHaveCount(0);
  expect(requests).toHaveLength(1);
});

test("시작 화면 조회 장애에는 시작 화면 없이 재시도 안내를 표시하고 토큰 재발급 없이 복원", async ({ page }) => {
  let refreshAttempts = 0;
  let userAttempts = 0;
  await page.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    if (route.request().url().endsWith("/csrf")) {
      await fulfillJson(route, { csrfToken: "test-csrf" });
      return;
    }
    refreshAttempts += 1;
    await fulfillJson(route, accessResponse());
  });
  await page.route(`${API_ORIGIN}/api/users/me`, async (route) => {
    userAttempts += 1;
    if (userAttempts === 1) {
      await fulfillJson(route, { code: "AUTH_SERVICE_UNAVAILABLE" }, 503);
      return;
    }
    await fulfillJson(route, currentUserResponse());
  });

  const failedUserResponse = page.waitForResponse(`${API_ORIGIN}/api/users/me`);
  await page.goto("/start");
  await failedUserResponse;
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole("alert", { name: "로그인 정보를 확인하지 못했어요" })).toContainText("잠시 후 다시 시도해 주세요.");
  await expect(page.getByRole("heading", { name: "모아홈을 시작해 보세요!" })).toHaveCount(0);
  await expect(page.getByLabel("모아 주민님 계정 정보")).toHaveCount(0);
  expect(refreshAttempts).toBe(1);
  expect(userAttempts).toBe(1);
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByLabel("모아 주민님 계정 정보")).toBeVisible();
  expect(refreshAttempts).toBe(1);
  expect(userAttempts).toBe(2);
});

test("시작 화면의 데스크톱·모바일 구성과 준비 중 기능 안내", async ({ page }) => {
  const requests: string[] = [];
  await page.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    const action = route.request().url().endsWith("/csrf") ? "csrf" : "refresh";
    requests.push(action);
    await fulfillJson(route, action === "csrf" ? { csrfToken: "test-csrf" } : accessResponse());
  });
  await page.route(`${API_ORIGIN}/api/users/me`, async (route) => {
    requests.push("me");
    await fulfillJson(route, currentUserResponse());
  });

  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto("/start");
  await expect(page.getByRole("heading", { name: "모아홈을 시작해 보세요!" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "관리할 곳 만들기" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "초대코드로 참여하기" })).toBeVisible();
  await expect(page.getByLabel("모아 주민님 계정 정보")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("startDesktop.png"), fullPage: true });

  await page.getByRole("button", { name: "관리할 곳 만들기", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "관리할 곳 만들기" })).toContainText("관리대상 등록 기능을 준비하고 있어요.");
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await page.getByRole("button", { name: "초대코드로 참여하기", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "초대코드로 참여하기" })).toContainText("초대코드 참여 기능을 준비하고 있어요.");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^승인 대기 중인 요청/ }).click();
  await expect(page.getByRole("dialog", { name: "승인 대기 중인 요청" })).toContainText("가입 요청 조회 기능을 준비하고 있어요.");
  await page.getByRole("button", { name: "확인", exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "관리 시작하기" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "초대로 참여하기" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("startMobile.png"), fullPage: true });
  await page.getByLabel("모아 주민님 계정 정보").click();
  await expect(page.getByText("모아홈에 오신 것을 환영해요.")).toBeVisible();
  expect(requests).toEqual(["csrf", "refresh", "me"]);
});
