import { getApiUrl } from './apiUrl';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface CustomApiOptions {
  url: string;
  method?: HttpMethod;
  data?: unknown;
  headers?: HeadersInit;
  timeoutMs?: number;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly errors: readonly ApiFieldError[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiFieldError {
  field: string;
  reason: string;
}

const reportedErrors = new WeakSet<object>();

/** 개발 콘솔에는 실패 위치와 안전한 진단 정보만 남기며, 전송부·화면이 같은 오류를 중복 기록하지 않습니다. */
export function reportApiError(error: unknown, context: Pick<CustomApiOptions, 'url' | 'method'> | { source: string }) {
  if (process.env.NODE_ENV !== 'development') return;
  if (error !== null && typeof error === 'object') {
    if (reportedErrors.has(error)) return;
    reportedErrors.add(error);
  }
  let path: string | undefined;
  if ('url' in context) {
    try {
      // 검색어·토큰이 들어갈 수 있는 쿼리와 해시·인증정보는 기록하지 않습니다.
      path = new URL(context.url, 'http://localhost').pathname;
    } catch {
      path = '(잘못된 요청 경로)';
    }
  }
  const apiError = error instanceof ApiError ? error : null;
  console.error('[모아홈 API 오류]', {
    ...('source' in context ? {
      source: context.source
    } : {
      method: context.method ?? 'GET',
      path
    }),
    status: apiError?.status,
    code: apiError && /^[A-Z][A-Z0-9_]{0,99}$/.test(apiError.code) ? apiError.code : 'UNKNOWN_ERROR',
    type: error instanceof Error && /^[A-Za-z][A-Za-z0-9]*$/.test(error.name) ? error.name : 'Error',
    fields: readFieldErrors({
      errors: apiError?.errors
    }),
    // 원본 예외 메시지는 입력값을 포함할 수 있어 제외하고 코드 위치만 보존합니다.
    stack: error instanceof Error ? error.stack?.split('\n').filter((line) => /^\s+at /.test(line)).join('\n') : undefined
  });
}

/** 응답 원문·메시지 대신 형식이 확인된 필드 경로와 이유만 보존해 화면의 안내에 사용합니다. */
function readFieldErrors(result: unknown): ApiFieldError[] {
  if (!result || typeof result !== 'object' || !('errors' in result) || !Array.isArray(result.errors)) return [];

  const reasons = ['REQUIRED', 'INVALID_TYPE', 'INVALID_FORMAT', 'TOO_LONG', 'OUT_OF_RANGE', 'DUPLICATE', 'INVALID_REFERENCE', 'INVALID_COMBINATION'];

  return result.errors.slice(0, 100).filter((entry) => entry && typeof entry.field === 'string'
    && entry.field.length <= 120 && /^[A-Za-z][A-Za-z0-9]*(?:\[\d+\])?(?:\.[A-Za-z][A-Za-z0-9]*)*$/.test(entry.field)
    && reasons.includes(entry.reason)).map((entry) => ({
    field: entry.field,
    reason: entry.reason
  }));
}

/** GET 데이터는 쿼리로 직렬화하며, 중첩 객체를 임의의 문자열로 바꾸지 않습니다. */
function appendQuery(url: URL, data: unknown) {
  if (data === undefined) {
    return;
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ApiError(0, 'INVALID_REQUEST', 'GET 데이터는 쿼리 객체여야 합니다.');
  }

  for (const [key, value] of Object.entries(data)) {
    const values = Array.isArray(value) ? value : [value];

    for (const item of values) {
      if (item === undefined || item === null) {
        continue;
      }

      if (!['string', 'number', 'boolean'].includes(typeof item)) {
        throw new ApiError(0, 'INVALID_REQUEST', '쿼리 값은 문자열, 숫자 또는 불리언이어야 합니다.');
      }

      url.searchParams.append(key, String(item));
    }
  }
}

/** 호출자가 처리할 오류를 그대로 유지하면서 개발자가 실패 요청을 콘솔에서 찾을 수 있게 합니다. */
export async function customAPI<T = unknown>(options: CustomApiOptions): Promise<T> {
  try {
    return await requestAPI<T>(options);
  } catch (error) {
    reportApiError(error, options);
    throw error;
  }
}

/** 공통 쿠키·캐시 설정으로 API를 호출하고 HTTP 오류와 JSON 응답을 일관되게 처리합니다. */
async function requestAPI<T = unknown>({
  url: path,
  method = 'GET',
  data,
  headers: customHeaders,
  timeoutMs = 15_000,
}: CustomApiOptions): Promise<T> {
  const url = getApiUrl(path);
  const headers = new Headers(customHeaders);
  headers.set('Accept', 'application/json');
  let body: BodyInit | undefined;

  if (method === 'GET') {
    appendQuery(url, data);
  } else if (data instanceof FormData) {
    // 브라우저가 파일의 multipart 경계를 생성하도록 Content-Type을 직접 지정하지 않습니다.
    body = data;
    headers.delete('Content-Type');
  } else if (data !== undefined) {
    body = JSON.stringify(data);
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  let responseText: string;

  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      credentials: 'include',
      cache: 'no-store',
      // 응답 대기가 무한정 계속되어 세션 복원 잠금이 유지되는 상황을 방지합니다.
      signal: AbortSignal.timeout(timeoutMs),
    });
    responseText = await response.text();
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.');
  }

  let result: unknown;

  try {
    result = responseText ? JSON.parse(responseText) : undefined;
  } catch {
    const code = response.ok ? 'INVALID_RESPONSE' : 'HTTP_ERROR';
    throw new ApiError(response.status, code, '서버 응답을 확인할 수 없습니다.');
  }

  if (!response.ok) {
    const code =
      typeof result === 'object' && result !== null && 'code' in result && typeof result.code === 'string'
        ? result.code
        : 'HTTP_ERROR';

    // 서버 오류 원문이나 응답 데이터를 메시지에 넣지 않아 인증정보 노출을 방지합니다.
    throw new ApiError(response.status, code, 'API 요청을 처리하지 못했습니다.', readFieldErrors(result));
  }

  // 204처럼 본문이 없는 API는 customAPI<void>()로 호출합니다.
  return result as T;
}
