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
      "Access-Control-Allow-Headers": "X-CSRF-TOKEN",
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

test("콜백은 CSRF 조회 후 한 번 재발급하고, 새로고침 후 다시 복원", async ({ page, context }) => {
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

  await page.goto("/login/callback");
  await expect(page.getByRole("heading", { name: "로그인했어요" })).toBeVisible();
  expect(requests).toEqual(["csrf", "refresh"]);
  const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie }));
  expect(JSON.stringify(storage)).not.toContain("test-access-memory-only");
  expect(storage.cookies).not.toContain("moahome-refresh");
  await page.reload();
  await expect(page.getByRole("heading", { name: "로그인했어요" })).toBeVisible();
  expect(requests).toEqual(["csrf", "refresh", "csrf", "refresh"]);
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
  await expect(page.getByRole("heading", { name: "로그인했어요" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "로그인했어요" })).toBeVisible();
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
  await expect(first.getByRole("heading", { name: "로그인했어요" })).toBeVisible();
  await expect(second.getByRole("heading", { name: "로그인했어요" })).toBeVisible();
  expect(requests).toEqual(["csrf", "refresh", "csrf", "refresh"]);
});

test("모바일 콜백 완료 화면이 가로로 넘치지 않음", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.route(`${API_ORIGIN}/api/auth/web/**`, async (route) => {
    await fulfillJson(route, route.request().url().endsWith("/csrf") ? { csrfToken: "test-csrf" } : accessResponse());
  });
  await page.goto("/login/callback");
  await expect(page.getByRole("heading", { name: "로그인했어요" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
