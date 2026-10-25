import { clearPropertyQueries } from '../src/features/enter-service/model/clearPropertyQueries';
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

test('파일 업로드의 인증 만료 재시도는 같은 multipart 본문을 유지', async () => {
  const data = new FormData();
  data.append('file', new Blob(['xlsx-content']), 'residents.xlsx');
  let posts = 0;
  globalThis.fetch = async (input, options) => {
    if (String(input).endsWith('/api/auth/web/csrf')) return Response.json({
      csrfToken: 'test-csrf'
    });
    if (String(input).endsWith('/api/auth/web/refresh')) {
      return Response.json({
        accessToken: 'test-new-access',
        tokenType: 'Bearer',
        accessExpiresAt: new Date(Date.now() + 60_000).toISOString()
      });
    }
    expect(options?.body).toBe(data);
    const headers = new Headers(options?.headers);
    expect(headers.has('Content-Type')).toBe(false);
    posts++;
    if (posts === 1) return expiredResponse();
    expect(headers.get('Authorization')).toBe('Bearer test-new-access');
    return Response.json({
      ok: true
    });
  };
  await expect(authenticatedAPI({
    url: '/api/upload',
    method: 'POST',
    data
  })).resolves.toEqual({
    ok: true
  });
  expect(posts).toBe(2);
});

test('취소된 업무 요청은 재발급하지 않고 같은 신호를 전송', async () => {
  const controller = new AbortController();
  controller.abort();
  let requests = 0;
  globalThis.fetch = async () => { requests++; return expiredResponse(); };
  await expect(authenticatedAPI({
    url: '/api/example',
    signal: controller.signal
  })).rejects.toMatchObject({
    code: 'REQUEST_CANCELED'
  });
  expect(requests).toBe(0);
  const active = new AbortController();
  globalThis.fetch = async (_url, options) => {
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    active.abort();
    throw active.signal.reason;
  };
  await expect(authenticatedAPI({
    url: '/api/example',
    signal: active.signal
  })).rejects.toMatchObject({
    code: 'REQUEST_CANCELED'
  });
});

test('Property 조회 취소와 캐시 정리는 현재 계정·대상에만 적용', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  const client = new QueryClient();
  client.setQueryData(['billing', 'user-a', 'property-b'], 'other-property');
  client.setQueryData(['billing', 'user-b', 'property-a'], 'other-user');
  client.setQueryData(['property-access', 'user-a', 'property-a'], 'current-access');
  client.setQueryData(['billing', 'user-a', 'property-a'], 'old-data');
  let canceled = false;
  const pending = client.fetchQuery({
    queryKey: ['resident-list', 'user-a', 'property-a'],
    queryFn: ({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => { canceled = true; reject(signal.reason); });
    })
  }).catch(() => undefined);
  await clearPropertyQueries(client, 'user-a', 'property-a');
  await pending;
  expect(canceled).toBe(true);
  expect(client.getQueryData(['billing', 'user-a', 'property-a'])).toBeUndefined();
  expect(client.getQueryData(['billing', 'user-a', 'property-b'])).toBe('other-property');
  expect(client.getQueryData(['billing', 'user-b', 'property-a'])).toBe('other-user');
  expect(client.getQueryData(['property-access', 'user-a', 'property-a'])).toBe('current-access');
  client.clear();
});

test('재발급 중 취소는 해당 호출만 중단하고 다른 호출의 재발급과 재시도를 보존', async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let refreshing = false;
  let retries = 0;
  globalThis.fetch = async (url, options) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/csrf')) return Response.json({
      csrfToken: 'test-csrf'
    });
    if (path.endsWith('/refresh')) {
      refreshing = true;
      await gate;
      return Response.json(createSession('test-new-access'));
    }
    if (new Headers(options?.headers).get('Authorization') === 'Bearer test-old-access') return expiredResponse();
    retries++;
    return Response.json({
      ok: true
    });
  };
  const controller = new AbortController();
  const canceled = authenticatedAPI({
    url: '/api/example',
    signal: controller.signal
  });
  const other = authenticatedAPI({
    url: '/api/example'
  });
  await expect.poll(() => refreshing).toBe(true);
  controller.abort();
  await expect(canceled).rejects.toMatchObject({
    code: 'REQUEST_CANCELED'
  });
  release();
  await expect(other).resolves.toEqual({
    ok: true
  });
  expect(retries).toBe(1);
});

test('접근 상실 뒤 늦은 Mutation 응답은 이전 캐시를 재생성하지 않고 계정 전환도 구분', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  const { capturePropertyQueryScope, endPropertyQueryScope, setPropertyQueryData } = await import('../src/entities/property/model/propertyQueryScope');
  const client = new QueryClient();
  const key = ['billing', 'user-late', 'property-late'];
  client.setQueryData(['session', 'current-user'], {
    id: 'user-late'
  });
  const old = capturePropertyQueryScope('user-late', 'property-late');
  setPropertyQueryData(client, key, 'saved', old);
  expect(client.getQueryData(key)).toBe('saved');
  endPropertyQueryScope('user-late', 'property-late');
  client.removeQueries({
    queryKey: key
  });
  setPropertyQueryData(client, key, 'late-response', old);
  expect(client.getQueryData(key)).toBeUndefined();
  const current = capturePropertyQueryScope('user-late', 'property-late');
  setPropertyQueryData(client, key, 'new-scope', current);
  expect(client.getQueryData(key)).toBe('new-scope');
  client.setQueryData(['session', 'current-user'], {
    id: 'other-user'
  });
  setPropertyQueryData(client, key, 'old-account', current);
  expect(client.getQueryData(key)).toBe('new-scope');
  client.clear();
});
