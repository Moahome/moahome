import {
  expect,
  test
} from '@playwright/test';
import {
  authenticatedAPI,
  clearSession,
  getSession,
  restoreSession,
  setSession,
  type WebSession
} from '../src/entities/session';

const originalFetch = globalThis.fetch;
const originalApiHost = process.env.NEXT_PUBLIC_API_HOST;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function createSession(accessToken = 'test-old-access'): WebSession {
  return {
    accessToken,
    tokenType: 'Bearer',
    csrfToken: 'test-csrf',
    // 서버와 클라이언트 시계가 달라도 서버의 만료 응답으로 재발급하는지 확인합니다.
    accessExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

function expiredResponse() {
  return Response.json({
    code: 'ACCESS_TOKEN_EXPIRED'
  }, {
    status: 401
  });
}

test.beforeEach(() => {
  process.env.NEXT_PUBLIC_API_HOST = 'http://localhost:8080';
  Object.defineProperty(globalThis, 'window', {
    value: {},
    configurable: true
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      locks: {
        request: (_name: string, callback: () => unknown) => Promise.resolve(callback())
      }
    },
    configurable: true,
  });
  setSession(createSession());
});

test.afterEach(async () => {
  // 새 로그인으로 차단 상태를 해제해 다음 테스트가 이전 인증 실패를 공유하지 않게 합니다.
  Object.defineProperty(globalThis, 'window', {
    value: {},
    configurable: true
  });
  setSession(createSession('test-cleanup-access'));
  await restoreSession();
  clearSession();
  globalThis.fetch = originalFetch;

  for (const [key, descriptor] of [['window', originalWindow], ['navigator', originalNavigator]] as const) {
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

test('업무 요청은 메모리의 Bearer를 자동 주입하고 호출자의 다른 헤더와 쿼리를 유지', async () => {
  const headers = new Headers({
    Authorization: 'Bearer stale-override',
    'X-Request-ID': 'test-request'
  });
  let requests = 0;
  globalThis.fetch = async (input, options) => {
    requests += 1;
    expect(new URL(String(input)).searchParams.get('name')).toBe('모아 홈');
    const sentHeaders = new Headers(options?.headers);
    expect(sentHeaders.get('Authorization')).toBe('Bearer test-old-access');
    expect(sentHeaders.get('X-Request-ID')).toBe('test-request');
    return Response.json({
      count: 1
    });
  };

  await expect(authenticatedAPI<{ count: number }>({
    url: '/api/example',
    data: {
      name: '모아 홈'
    },
    headers,
  })).resolves.toEqual({
    count: 1
  });
  expect(requests).toBe(1);
  expect(headers.get('Authorization')).toBe('Bearer stale-override');
});

for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
  test(`${method} 만료 응답 뒤 CSRF와 Rotation을 거쳐 원래 요청을 한 번 재시도`, async () => {
    const requests: { path: string; method?: string; body: unknown; authorization: string | null }[] = [];
    globalThis.fetch = async (input, options) => {
      const url = new URL(String(input));
      const headers = new Headers(options?.headers);
      requests.push({
        path: url.pathname,
        method: options?.method,
        body: options?.body,
        authorization: headers.get('Authorization')
      });

      if (url.pathname.endsWith('/csrf')) {
        return Response.json({
          csrfToken: 'test-new-csrf'
        });
      }

      if (url.pathname.endsWith('/refresh')) {
        expect(headers.get('X-CSRF-TOKEN')).toBe('test-new-csrf');
        expect(headers.has('Authorization')).toBe(false);
        return Response.json(createSession('test-new-access'));
      }

      expect(url.searchParams.get('filter')).toBe('active');
      expect(headers.get('X-Request-ID')).toBe('test-request');
      if (method === 'GET') {
        expect(url.searchParams.get('name')).toBe('모아홈');
      }

      return headers.get('Authorization') === 'Bearer test-old-access'
        ? expiredResponse()
        : new Response(null, {
          status: 204
        });
    };

    await expect(authenticatedAPI<void>({
      url: '/api/example?filter=active',
      method,
      data: {
        name: '모아홈'
      },
      headers: {
        'X-Request-ID': 'test-request'
      },
    })).resolves.toBeUndefined();
    expect(requests.map((request) => request.path)).toEqual([
      '/api/example', '/api/auth/web/csrf', '/api/auth/web/refresh', '/api/example',
    ]);
    expect(requests[0]).toMatchObject({
      method,
      authorization: 'Bearer test-old-access'
    });
    expect(requests[3]).toMatchObject({
      method,
      authorization: 'Bearer test-new-access'
    });
    expect(requests[3].body).toBe(requests[0].body);
    expect(getSession()?.accessToken).toBe('test-new-access');
  });
}

for (const [status, code] of [
  [401, 'AUTHENTICATION_REQUIRED'],
  [401, 'INVALID_TOKEN'],
  [401, 'SESSION_EXPIRED'],
  [401, 'REFRESH_TOKEN_EXPIRED'],
  [401, 'REFRESH_TOKEN_REUSED'],
  [403, 'ACCESS_DENIED'],
  [403, 'ACCESS_TOKEN_EXPIRED'],
  [503, 'AUTH_SERVICE_UNAVAILABLE'],
] as const) {
  test(`${status} / ${code}는 재발급과 원래 요청 재시도 없이 실패를 전달`, async () => {
    const previousSession = getSession();
    let requests = 0;
    globalThis.fetch = async () => {
      requests += 1;
      return Response.json({
        code
      }, {
        status
      });
    };

    await expect(authenticatedAPI({
      url: '/api/example'
    })).rejects.toMatchObject({
      status,
      code
    });
    expect(requests).toBe(1);
    expect(getSession()).toBe(previousSession);
  });
}

test('업무 요청의 네트워크 실패는 자동 재시도하지 않음', async () => {
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    throw new TypeError('test-network-failure');
  };

  await expect(authenticatedAPI({
    url: '/api/example'
  })).rejects.toMatchObject({
    code: 'NETWORK_ERROR'
  });
  expect(requests).toBe(1);
});

test('메모리 세션이 없거나 서버 환경이면 업무 요청과 자동 재발급을 실행하지 않음', async () => {
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return Response.json({});
  };

  clearSession();
  await expect(authenticatedAPI({
    url: '/api/example'
  })).rejects.toMatchObject({
    code: 'AUTHENTICATION_REQUIRED'
  });
  setSession(createSession());
  Reflect.deleteProperty(globalThis, 'window');
  await expect(authenticatedAPI({
    url: '/api/example'
  })).rejects.toMatchObject({
    code: 'AUTHENTICATION_REQUIRED'
  });
  expect(requests).toBe(0);
});

test('동시에 만료된 업무 요청들은 같은 재발급을 공유하고 각각 한 번 재시도', async () => {
  let refreshRequests = 0;
  let businessRequests = 0;
  let releaseRefresh: () => void = () => {};
  let markRefreshStarted: () => void = () => {};
  const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  const refreshStarted = new Promise<void>((resolve) => { markRefreshStarted = resolve; });

  globalThis.fetch = async (input, options) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/csrf')) {
      return Response.json({
        csrfToken: 'test-csrf'
      });
    }
    if (path.endsWith('/refresh')) {
      refreshRequests += 1;
      markRefreshStarted();
      await refreshGate;
      return Response.json(createSession('test-new-access'));
    }
    businessRequests += 1;
    return new Headers(options?.headers).get('Authorization') === 'Bearer test-old-access'
      ? expiredResponse()
      : Response.json({
        ok: true
      });
  };

  const first = authenticatedAPI({
    url: '/api/first'
  });
  const second = authenticatedAPI({
    url: '/api/second'
  });
  await refreshStarted;
  releaseRefresh();
  await expect(Promise.all([first, second])).resolves.toEqual([{
    ok: true
  }, {
    ok: true
  }]);
  expect(refreshRequests).toBe(1);
  expect(businessRequests).toBe(4);
});

test('늦게 도착한 이전 토큰의 만료 응답은 갱신된 메모리 토큰으로 재시도', async () => {
  let refreshRequests = 0;
  let releaseLateResponse: () => void = () => {};
  const lateResponse = new Promise<void>((resolve) => { releaseLateResponse = resolve; });
  const authorizations: string[] = [];

  globalThis.fetch = async (input, options) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/csrf')) {
      return Response.json({
        csrfToken: 'test-csrf'
      });
    }
    if (path.endsWith('/refresh')) {
      refreshRequests += 1;
      return Response.json(createSession('test-new-access'));
    }
    const authorization = new Headers(options?.headers).get('Authorization') ?? '';
    authorizations.push(authorization);
    if (authorization === 'Bearer test-old-access') {
      if (path === '/api/late') {
        await lateResponse;
      }
      return expiredResponse();
    }
    return Response.json({
      ok: true
    });
  };

  const first = authenticatedAPI({
    url: '/api/first'
  });
  const late = authenticatedAPI({
    url: '/api/late'
  });
  await first;
  releaseLateResponse();
  await late;
  expect(refreshRequests).toBe(1);
  expect(authorizations).toEqual([
    'Bearer test-old-access', 'Bearer test-old-access', 'Bearer test-new-access', 'Bearer test-new-access',
  ]);
});

test('재시도도 Access 만료이면 두 번째 재발급 없이 실패를 전달', async () => {
  const paths: string[] = [];
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    if (path.endsWith('/csrf')) {
      return Response.json({
        csrfToken: 'test-csrf'
      });
    }
    return path.endsWith('/refresh') ? Response.json(createSession('test-new-access')) : expiredResponse();
  };

  await expect(authenticatedAPI({
    url: '/api/example'
  })).rejects.toMatchObject({
    status: 401,
    code: 'ACCESS_TOKEN_EXPIRED'
  });
  expect(paths).toEqual(['/api/example', '/api/auth/web/csrf', '/api/auth/web/refresh', '/api/example']);
});

for (const failurePath of ['/api/auth/web/csrf', '/api/auth/web/refresh']) {
  test(`${failurePath}의 503은 기존 세션을 유지하고 업무 요청을 재시도하지 않음`, async () => {
    const previousSession = getSession();
    const paths: string[] = [];
    globalThis.fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      paths.push(path);
      if (path === failurePath) {
        return Response.json({
          code: 'AUTH_SERVICE_UNAVAILABLE'
        }, {
          status: 503
        });
      }
      return path.endsWith('/csrf') ? Response.json({
        csrfToken: 'test-csrf'
      }) : expiredResponse();
    };

    await expect(authenticatedAPI({
      url: '/api/example'
    })).rejects.toMatchObject({
      status: 503
    });
    expect(paths.filter((path) => path === '/api/example')).toHaveLength(1);
    expect(paths.at(-1)).toBe(failurePath);
    expect(getSession()).toBe(previousSession);
  });
}

test('재발급 자체의 401은 재귀적으로 재발급하지 않고 메모리 세션을 제거', async () => {
  const paths: string[] = [];
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    return path.endsWith('/csrf') ? Response.json({
      csrfToken: 'test-csrf'
    }) : expiredResponse();
  };

  await expect(authenticatedAPI({
    url: '/api/example'
  })).rejects.toMatchObject({
    status: 401,
    code: 'ACCESS_TOKEN_EXPIRED'
  });
  expect(paths).toEqual(['/api/example', '/api/auth/web/csrf', '/api/auth/web/refresh']);
  expect(getSession()).toBeNull();
});

test('Rotation 응답 유실 뒤에는 업무 요청을 재시도하거나 추가 재발급하지 않음', async () => {
  let refreshRequests = 0;
  let businessRequests = 0;
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/csrf')) {
      return Response.json({
        csrfToken: 'test-csrf'
      });
    }
    if (path.endsWith('/refresh')) {
      refreshRequests += 1;
      throw new TypeError('response-lost');
    }
    businessRequests += 1;
    return expiredResponse();
  };

  await expect(authenticatedAPI({
    url: '/api/example'
  })).rejects.toMatchObject({
    code: 'LOGIN_REQUIRED'
  });
  await expect(restoreSession()).rejects.toMatchObject({
    code: 'LOGIN_REQUIRED'
  });
  expect(businessRequests).toBe(1);
  expect(refreshRequests).toBe(1);
  expect(getSession()).toBeNull();

  // 새 로그인 세션을 설정한 뒤에는 이전 실패의 차단을 해제하고 정상 요청을 허용합니다.
  setSession(createSession('test-new-login-access'));
  await expect(restoreSession()).resolves.toMatchObject({
    accessToken: 'test-new-login-access'
  });
  expect(refreshRequests).toBe(1);
});
