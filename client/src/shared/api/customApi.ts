import { getApiUrl } from "./apiUrl";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface CustomApiOptions {
  url: string;
  method?: HttpMethod;
  data?: unknown;
  headers?: HeadersInit;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** GET 데이터는 쿼리로 직렬화하며, 중첩 객체를 임의의 문자열로 바꾸지 않습니다. */
function appendQuery(url: URL, data: unknown) {
  if (data === undefined) {
    return;
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ApiError(0, "INVALID_REQUEST", "GET 데이터는 쿼리 객체여야 합니다.");
  }

  for (const [key, value] of Object.entries(data)) {
    const values = Array.isArray(value) ? value : [value];

    for (const item of values) {
      if (item === undefined || item === null) {
        continue;
      }

      if (!["string", "number", "boolean"].includes(typeof item)) {
        throw new ApiError(0, "INVALID_REQUEST", "쿼리 값은 문자열, 숫자 또는 불리언이어야 합니다.");
      }

      url.searchParams.append(key, String(item));
    }
  }
}

/** 공통 쿠키·캐시 설정으로 API를 호출하고 HTTP 오류와 JSON 응답을 일관되게 처리합니다. */
export async function customAPI<T = unknown>({
  url: path,
  method = "GET",
  data,
  headers: customHeaders,
}: CustomApiOptions): Promise<T> {
  const url = getApiUrl(path);
  const headers = new Headers(customHeaders);
  headers.set("Accept", "application/json");
  let body: string | undefined;

  if (method === "GET") {
    appendQuery(url, data);
  } else if (data !== undefined) {
    body = JSON.stringify(data);
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  let responseText: string;

  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      credentials: "include",
      cache: "no-store",
      // 응답 대기가 무한정 계속되어 세션 복원 잠금이 유지되는 상황을 방지합니다.
      signal: AbortSignal.timeout(15_000),
    });
    responseText = await response.text();
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "서버에 연결할 수 없습니다.");
  }

  let result: unknown;

  try {
    result = responseText ? JSON.parse(responseText) : undefined;
  } catch {
    const code = response.ok ? "INVALID_RESPONSE" : "HTTP_ERROR";
    throw new ApiError(response.status, code, "서버 응답을 확인할 수 없습니다.");
  }

  if (!response.ok) {
    const code =
      typeof result === "object" && result !== null && "code" in result && typeof result.code === "string"
        ? result.code
        : "HTTP_ERROR";

    // 서버 오류 원문이나 응답 데이터를 메시지에 넣지 않아 인증정보 노출을 방지합니다.
    throw new ApiError(response.status, code, "API 요청을 처리하지 못했습니다.");
  }

  // 204처럼 본문이 없는 API는 customAPI<void>()로 호출합니다.
  return result as T;
}
