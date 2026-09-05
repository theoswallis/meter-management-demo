export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface HttpRequestOptions<TBody = unknown> {
  method?: HttpMethod;
  headers?: Record<string, string> | Headers;
  params?: QueryParams;
  body?: TBody;
  signal?: AbortSignal;
}

export interface HttpResponse<TData = unknown> {
  data: TData;
  status: number;
  statusText: string;
  headers: Headers;
  ok: boolean;
}

export interface HttpClientConfig {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
}
