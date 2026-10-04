import { expect, test } from "@playwright/test";
import { clearSession, getSession, setSession } from "../src/entities/session";
import { restoreSession } from "../src/features/restore-session";

const originalFetch = globalThis.fetch;
const originalApiHost = process.env.NEXT_PUBLIC_API_HOST;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

test.beforeEach(() => {
  process.env.NEXT_PUBLIC_API_HOST = "http://localhost:8080";
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  Object.defineProperty(globalThis, "navigator", {
    value: { locks: { request: (_name: string, callback: () => unknown) => Promise.resolve(callback()) } },
    configurable: true,
  });
  clearSession();
});

test.afterEach(() => {
  clearSession();
  globalThis.fetch = originalFetch;

  for (const [key, descriptor] of [["window", originalWindow], ["navigator", originalNavigator]] as const) {
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, key);
    }
  }

  if (originalApiHost === undefined) {
    delete process.env.NEXT_PUBLIC_API_HOST;
  } else {
    process.env.NEXT_PUBLIC_API_HOST = originalApiHost;
  }
});

test("동시에 복원해도 한 번 재발급하고 유효한 Access Token은 메모리에서 재사용", async () => {
  const requests: string[] = [];
  let releaseRefresh: () => void = () => {};
  let markRefreshStarted: () => void = () => {};
  const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  const refreshStarted = new Promise<void>((resolve) => { markRefreshStarted = resolve; });

  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    requests.push(path);
    if (path.endsWith("/csrf")) {
      return Response.json({ csrfToken: "test-csrf" });
    }
    markRefreshStarted();
    await refreshGate;
    return Response.json({ accessToken: "test-memory-access", tokenType: "Bearer", accessExpiresAt: new Date(Date.now() + 60_000).toISOString() });
  };

  const first = restoreSession();
  const second = restoreSession();
  expect(first).toBe(second);
  await refreshStarted;
  releaseRefresh();
  const [firstSession, secondSession] = await Promise.all([first, second]);
  expect(firstSession).toBe(secondSession);
  expect(getSession()).toBe(firstSession);
  expect(firstSession.csrfToken).toBe("test-csrf");
  await restoreSession();
  expect(requests).toEqual(["/api/auth/web/csrf", "/api/auth/web/refresh"]);
});

test("재발급 503은 기존 메모리 토큰을 지우지 않고 서버에서 세션을 공유하지 않음", async () => {
  const expiredSession = {
    accessToken: "test-previous-access",
    tokenType: "Bearer" as const,
    csrfToken: "test-csrf",
    accessExpiresAt: new Date(Date.now() - 60_000).toISOString(),
  };
  setSession(expiredSession);
  globalThis.fetch = async (input) => new URL(String(input)).pathname.endsWith("/csrf")
    ? Response.json({ csrfToken: "test-csrf" })
    : Response.json({ code: "AUTH_SERVICE_UNAVAILABLE" }, { status: 503 });

  await expect(restoreSession()).rejects.toMatchObject({ status: 503 });
  expect(getSession()).toBe(expiredSession);
  Reflect.deleteProperty(globalThis, "window");
  expect(getSession()).toBeNull();
  expect(() => setSession(expiredSession)).toThrow("브라우저에서만");
});

test("Rotation 응답 유실 뒤에는 추가 재발급을 차단", async () => {
  let refreshRequests = 0;
  globalThis.fetch = async (input) => {
    if (new URL(String(input)).pathname.endsWith("/csrf")) {
      return Response.json({ csrfToken: "test-csrf" });
    }
    refreshRequests += 1;
    throw new TypeError("response-lost");
  };

  await expect(restoreSession()).rejects.toMatchObject({ code: "LOGIN_REQUIRED" });
  await expect(restoreSession()).rejects.toMatchObject({ code: "LOGIN_REQUIRED" });
  expect(refreshRequests).toBe(1);
  expect(getSession()).toBeNull();
});
