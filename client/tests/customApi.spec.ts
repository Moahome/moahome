import {
  expect,
  test
} from '@playwright/test';
import {
  ApiError,
  customAPI,
  getApiUrl,
  isServerConnectionError,
  reportApiError
} from '../src/shared/api';

const originalFetch = globalThis.fetch;
const originalApiHost = process.env.NEXT_PUBLIC_API_HOST;
const originalNodeEnv = process.env.NODE_ENV;
const originalConsoleError = console.error;

test('연결 오류 안내는 통신·서버 장애만 포함하고 인증·권한·입력 오류는 제외', () => {
  for (const error of [new ApiError(0, 'NETWORK_ERROR', ''), new ApiError(500, 'HTTP_ERROR', ''), new ApiError(503, 'SERVICE_UNAVAILABLE', ''), new ApiError(504, 'HTTP_ERROR', '')]) {
    expect(isServerConnectionError(error)).toBe(true);
  }
  for (const error of [null, new Error('local error'), new ApiError(0, 'LOGIN_REQUIRED', ''), new ApiError(0, 'INVALID_REQUEST', ''), new ApiError(401, 'AUTHENTICATION_REQUIRED', ''), new ApiError(403, 'ACCESS_DENIED', ''), new ApiError(409, 'CONFLICT', '')]) {
    expect(isServerConnectionError(error)).toBe(false);
  }
});

test.beforeEach(() => {
  process.env.NEXT_PUBLIC_API_HOST = 'http://localhost:8080';
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
  if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
  else Object.assign(process.env, {
    NODE_ENV: originalNodeEnv
  });

  if (originalApiHost === undefined) {
    delete process.env.NEXT_PUBLIC_API_HOST;
  } else {
    process.env.NEXT_PUBLIC_API_HOST = originalApiHost;
  }
});

test('개발 콘솔은 실패 요청의 경로·상태·검증 필드만 한 번 기록하고 입력·인증정보를 제외', async () => {
  Object.assign(process.env, {
    NODE_ENV: 'development'
  });
  const logs: unknown[][] = [];
  console.error = (...args: unknown[]) => { logs.push(args); };
  globalThis.fetch = async () => Response.json({
    code: 'INVALID_REQUEST',
    message: 'private-server-response',
    errors: [{
      field: 'bankAccounts[0].holderName',
      reason: 'REQUIRED',
      value: 'private-holder-name'
    }]
  }, {
    status: 400
  });
  const error = await customAPI({
    url: '/api/properties/example/banking/import?token=private-query-token',
    method: 'POST',
    headers: {
      Authorization: 'Bearer private-access-token',
      'X-CSRF-TOKEN': 'private-csrf-token'
    },
    data: {
      payer: 'private-payer-name',
      accountNumber: 'private-bank-number'
    }
  }).catch((failure: unknown) => failure);
  reportApiError(error, {
    source: '통장 관리'
  });
  expect(logs).toHaveLength(1);
  expect(logs[0][0]).toBe('[모아홈 API 오류]');
  expect(logs[0][1]).toMatchObject({
    method: 'POST',
    path: '/api/properties/example/banking/import',
    status: 400,
    code: 'INVALID_REQUEST',
    fields: [{
      field: 'bankAccounts[0].holderName',
      reason: 'REQUIRED'
    }]
  });
  expect((logs[0][1] as { stack: string }).stack).toContain('customApi');
  expect(JSON.stringify(logs)).not.toContain('private-');
  expect(error).toMatchObject({
    status: 400,
    code: 'INVALID_REQUEST'
  });
});

test('개발 콘솔은 네트워크·응답 형식 오류를 구분하고 성공 요청과 프로덕션 오류를 기록하지 않음', async () => {
  Object.assign(process.env, {
    NODE_ENV: 'development'
  });
  const logs: unknown[][] = [];
  console.error = (...args: unknown[]) => { logs.push(args); };
  globalThis.fetch = async () => { throw new TypeError('private-network-detail'); };
  await expect(customAPI({
    url: '/api/example'
  })).rejects.toMatchObject({
    code: 'NETWORK_ERROR'
  });
  globalThis.fetch = async () => new Response('<html>private-response-body</html>');
  await expect(customAPI({
    url: '/api/example'
  })).rejects.toMatchObject({
    code: 'INVALID_RESPONSE'
  });
  expect(logs.map((entry) => (entry[1] as { code: string }).code)).toEqual(['NETWORK_ERROR', 'INVALID_RESPONSE']);
  expect(JSON.stringify(logs)).not.toContain('private-');
  globalThis.fetch = async () => Response.json({
    ok: true
  });
  await customAPI({
    url: '/api/example'
  });
  expect(logs).toHaveLength(2);
  Object.assign(process.env, {
    NODE_ENV: 'production'
  });
  globalThis.fetch = async () => Response.json({
    code: 'SERVICE_UNAVAILABLE'
  }, {
    status: 503
  });
  await expect(customAPI({
    url: '/api/example'
  })).rejects.toMatchObject({
    status: 503
  });
  expect(logs).toHaveLength(2);
});

test('GET 쿼리 인코딩과 공통 쿠키·캐시 설정', async () => {
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input));
    expect(url.origin).toBe('http://localhost:8080');
    expect(url.pathname).toBe('/api/example');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('name')).toBe('모아 홈&');
    expect(url.searchParams.getAll('role')).toEqual(['ADMIN', 'RESIDENT']);
    expect(url.searchParams.get('active')).toBe('false');
    expect(url.searchParams.has('empty')).toBe(false);
    expect(options?.method).toBe('GET');
    expect(options?.body).toBeUndefined();
    expect(options?.credentials).toBe('include');
    expect(options?.cache).toBe('no-store');
    return Response.json({
      count: 2
    });
  };

  const result = await customAPI<{ count: number }>({
    url: '/api/example',
    data: {
      page: 2,
      name: '모아 홈&',
      role: ['ADMIN', 'RESIDENT'],
      active: false,
      empty: null
    },
  });
  expect(result.count).toBe(2);
});

test('POST는 JSON 본문과 선택한 보안 헤더를 전달', async () => {
  globalThis.fetch = async (_input, options) => {
    const headers = new Headers(options?.headers);
    expect(options?.method).toBe('POST');
    expect(options?.body).toBe(JSON.stringify({
      name: '모아홈'
    }));
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-CSRF-TOKEN')).toBe('test-csrf');
    expect(headers.get('Authorization')).toBe('Bearer test-access');
    return Response.json({
      ok: true
    });
  };

  await customAPI({
    url: '/api/example',
    method: 'POST',
    data: {
      name: '모아홈'
    },
    headers: {
      'X-CSRF-TOKEN': 'test-csrf',
      Authorization: 'Bearer test-access'
    },
  });
});

test('204 응답은 JSON 파싱 오류 없이 처리', async () => {
  globalThis.fetch = async () => new Response(null, {
    status: 204
  });
  await expect(customAPI<void>({
    url: '/api/example',
    method: 'DELETE'
  })).resolves.toBeUndefined();
});

test('인증 실패의 HTTP 상태와 서버 코드를 유지하고 응답 원문은 오류에 포함하지 않음', async () => {
  globalThis.fetch = async () => Response.json(
    {
      code: 'SESSION_EXPIRED',
      message: 'private-response-value'
    },
    {
      status: 401
    },
  );

  const error = await customAPI({
    url: '/api/example'
  }).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({
    status: 401,
    code: 'SESSION_EXPIRED'
  });
  expect(String(error)).not.toContain('private-response-value');
});

test('JSON이 아닌 장애 응답도 503 상태를 유지', async () => {
  globalThis.fetch = async () => new Response('<html>Unavailable</html>', {
    status: 503
  });
  await expect(customAPI({
    url: '/api/example'
  })).rejects.toMatchObject({
    status: 503,
    code: 'HTTP_ERROR'
  });
});

test('잘못된 성공 응답과 네트워크 실패를 구분', async () => {
  globalThis.fetch = async () => new Response('invalid-json');
  await expect(customAPI({
    url: '/api/example'
  })).rejects.toMatchObject({
    status: 200,
    code: 'INVALID_RESPONSE'
  });

  globalThis.fetch = async () => { throw new TypeError('private-network-detail'); };
  await expect(customAPI({
    url: '/api/example'
  })).rejects.toMatchObject({
    status: 0,
    code: 'NETWORK_ERROR'
  });
});

test('GET 중첩 데이터와 다른 호스트의 URL은 전송 전에 거부', async () => {
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return Response.json({});
  };

  await expect(customAPI({
    url: '/api/example',
    data: {
      nested: {
        value: 1
      }
    }
  })).rejects.toMatchObject({
    code: 'INVALID_REQUEST'
  });
  expect(() => getApiUrl('https://external.example/api')).toThrow();
  expect(() => getApiUrl('//external.example/api')).toThrow();
  expect(() => getApiUrl('/\\external.example/api')).toThrow();
  expect(requests).toBe(0);
});

test('입력 오류는 안전한 필드·reason만 유지하고 응답 메시지·원문과 잘못된 경로를 제외', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: 'INVALID_REQUEST',
    message: 'private-token-original',
    errors: [
      {
        field: 'bankAccounts[0].holderName',
        reason: 'REQUIRED',
        message: 'private-account-original',
        value: 'private-value'
      },
      {
        field: '<script>',
        reason: 'REQUIRED'
      },
      {
        field: 'feeItems[0].itemName',
        reason: 'private-reason'
      }
    ]
  }), {
    status: 400
  });
  try {
    await customAPI({
      url: '/api/property-registrations',
      method: 'POST',
      data: {}
    });
    throw new Error('expected failure');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.errors).toEqual([{
      field: 'bankAccounts[0].holderName',
      reason: 'REQUIRED'
    }]);
    expect(JSON.stringify(apiError)).not.toContain('private-');
    expect(apiError.message).not.toContain('private-');
  }
});

test('multipart 파일은 JSON 변환·Content-Type 지정 없이 Bearer와 함께 전달', async () => {
  const data = new FormData();
  data.append('file', new Blob(['xlsx-content']), 'residents.xlsx');
  globalThis.fetch = async (_input, options) => {
    const headers = new Headers(options?.headers);
    expect(options?.body).toBe(data);
    expect(headers.has('Content-Type')).toBe(false);
    expect(headers.get('Authorization')).toBe('Bearer test-access');
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    return Response.json({
      ok: true
    });
  };
  await customAPI({
    url: '/api/example',
    method: 'POST',
    data,
    timeoutMs: 60_000,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-access'
    }
  });
});

test('호출자 취소·본문 읽기 취소·타임아웃은 네트워크 장애와 구분', async () => {
  const canceled = new AbortController();
  canceled.abort();
  let sent = 0;
  globalThis.fetch = async () => { sent++; return Response.json({}); };
  await expect(customAPI({
    url: '/api/example',
    signal: canceled.signal
  })).rejects.toMatchObject({
    code: 'REQUEST_CANCELED'
  });
  expect(sent).toBe(0);
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), {
      once: true
    });
  });
  await expect(customAPI({
    url: '/api/example',
    timeoutMs: 10
  })).rejects.toMatchObject({
    code: 'REQUEST_TIMEOUT'
  });
  const body = new AbortController();
  globalThis.fetch = async () => {
    const response = Response.json({});
    response.text = async () => { body.abort(); throw new DOMException('canceled', 'AbortError'); };
    return response;
  };
  await expect(customAPI({
    url: '/api/example',
    signal: body.signal
  })).rejects.toMatchObject({
    code: 'REQUEST_CANCELED'
  });
});
