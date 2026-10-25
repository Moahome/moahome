export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface CustomApiOptions {
  url: string;
  method?: HttpMethod;
  data?: unknown;
  headers?: HeadersInit;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ApiFieldError {
  field: string;
  reason: string;
}

export interface ApiErrorSource {
  source: string;
}
