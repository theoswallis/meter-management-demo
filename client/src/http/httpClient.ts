import type {
  HttpClientConfig,
  HttpRequestOptions,
  HttpResponse,
  QueryParams,
} from './types.js';

export function resolveUrl(baseUrl: string, path: string, params?: QueryParams): string {
  let fullUrl: string;

  if (/^https?:\/\//i.test(path)) {
    fullUrl = path;
  } else {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const cleanPath = path.replace(/^\/+/, '');
    fullUrl = cleanBase ? `${cleanBase}/${cleanPath}` : `/${cleanPath}`;
  }

  if (params && Object.keys(params).length > 0) {
    const hasOrigin = /^https?:\/\//i.test(fullUrl);
    const dummyBase = 'http://localhost';
    const url = new URL(fullUrl, hasOrigin ? undefined : dummyBase);

    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null) {
        url.searchParams.append(key, String(val));
      }
    }

    if (hasOrigin) {
      return url.toString();
    }
    return `${url.pathname}${url.search}`;
  }

  return fullUrl;
}

export class HttpClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(config: HttpClientConfig = {}) {
    const envBase = typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_API_BASE_URL
      : undefined;

    this.baseUrl =
      config.baseUrl ??
      (envBase !== undefined
        ? envBase
        : typeof window !== 'undefined'
          ? ''
          : 'http://localhost:3000');
    this.defaultHeaders = {
      Accept: 'application/json',
      ...config.defaultHeaders,
    };
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  public resolvePath(path: string, params?: QueryParams): string {
    return resolveUrl(this.baseUrl, path, params);
  }

  public async request<T = unknown, B = unknown>(
    path: string,
    options: HttpRequestOptions<B> = {}
  ): Promise<HttpResponse<T>> {
    const url = this.resolvePath(path, options.params);
    const headers = new Headers(this.defaultHeaders);

    if (options.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((val, key) => headers.set(key, val));
      } else {
        Object.entries(options.headers).forEach(([key, val]) => {
          headers.set(key, val);
        });
      }
    }

    let body: BodyInit | undefined;
    if (options.body !== undefined && options.body !== null) {
      if (
        typeof options.body === 'string' ||
        options.body instanceof FormData ||
        options.body instanceof Blob ||
        options.body instanceof URLSearchParams
      ) {
        body = options.body as BodyInit;
      } else {
        body = JSON.stringify(options.body);
        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json');
        }
      }
    }

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body,
      signal: options.signal,
    });

    let data: T;
    const contentType = response.headers.get('content-type');

    if (response.status === 204 || response.status === 205) {
      data = undefined as unknown as T;
    } else if (contentType && contentType.includes('application/json')) {
      data = (await response.json()) as T;
    } else {
      const text = await response.text();
      try {
        data = (text.length > 0 ? JSON.parse(text) : undefined) as T;
      } catch {
        data = text as unknown as T;
      }
    }

    return {
      data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      ok: response.ok,
    };
  }

  public get<T>(
    path: string,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  public post<T, B = unknown>(
    path: string,
    body?: B,
    options?: Omit<HttpRequestOptions<B>, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T, B>(path, { ...options, method: 'POST', body });
  }

  public put<T, B = unknown>(
    path: string,
    body?: B,
    options?: Omit<HttpRequestOptions<B>, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T, B>(path, { ...options, method: 'PUT', body });
  }

  public patch<T, B = unknown>(
    path: string,
    body?: B,
    options?: Omit<HttpRequestOptions<B>, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T, B>(path, { ...options, method: 'PATCH', body });
  }

  public delete<T>(
    path: string,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

export const httpClient = new HttpClient();

export * from './types.js';
