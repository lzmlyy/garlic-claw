import { AppError, AuthError, toAppError } from "@/utils/error";

const API_BASE = "/api";
const DEFAULT_TIMEOUT = 15000;

interface ApiEnvelope<T = unknown> {
  code: number;
  message: string;
  data: T;
}

type RequestBody = BodyInit | object | number | boolean | null;
type MaybePromise<T> = T | Promise<T>;
type RequestOptionsWithoutMethodOrBody = Omit<
  HttpRequestOptions,
  "method" | "body"
>;

export interface HttpRequestOptions extends Omit<RequestInit, "body"> {
  body?: RequestBody;
  timeout?: number;
  skipAuth?: boolean;
  skipRefreshRetry?: boolean;
  skipUnauthorizedRedirect?: boolean;
  skipEnvelope?: boolean;
}

export interface HttpRequestContext extends Omit<RequestInit, "headers"> {
  url: string;
  headers: Headers;
  timeout: number;
}

export interface HttpResponseWithMetadata<T> {
  status: number;
  headers: Record<string, string>;
  body: T;
}

export type HttpRequestInterceptor = (
  context: HttpRequestContext,
) => MaybePromise<HttpRequestContext>;

const requestInterceptors = new Set<HttpRequestInterceptor>();

let refreshPromise: Promise<boolean> | null = null;

export function getApiBase() {
  return API_BASE;
}

export function addRequestInterceptor(interceptor: HttpRequestInterceptor) {
  requestInterceptors.add(interceptor);

  return () => {
    requestInterceptors.delete(interceptor);
  };
}

export async function request<T>(
  path: string,
  options: HttpRequestOptions = {},
): Promise<T> {
  try {
    const response = await executeRequest(path, options);
    return await parseResponseData<T>(response, options);
  } catch (error) {
    throw toAppError(error);
  }
}

export async function requestWithMetadata<T>(
  path: string,
  options: HttpRequestOptions = {},
): Promise<HttpResponseWithMetadata<T>> {
  try {
    const response = await executeRequest(path, options);
    return {
      status: response.status,
      headers: collectHeaders(response.headers),
      body: await parseResponseData<T>(response, options),
    };
  } catch (error) {
    throw toAppError(error);
  }
}

export async function requestRaw(
  path: string,
  options: HttpRequestOptions = {},
): Promise<Response> {
  try {
    const response = await executeRequest(path, options);
    await ensureSuccessfulResponse(response);
    return response;
  } catch (error) {
    throw toAppError(error);
  }
}

export function get<T>(
  path: string,
  options: RequestOptionsWithoutMethodOrBody = {},
) {
  return request<T>(path, {
    ...options,
    method: "GET",
  });
}

export function post<T>(
  path: string,
  body?: RequestBody,
  options: RequestOptionsWithoutMethodOrBody = {},
) {
  return request<T>(path, {
    ...options,
    method: "POST",
    body,
  });
}

export function put<T>(
  path: string,
  body?: RequestBody,
  options: RequestOptionsWithoutMethodOrBody = {},
) {
  return request<T>(path, {
    ...options,
    method: "PUT",
    body,
  });
}

export function patch<T>(
  path: string,
  body?: RequestBody,
  options: RequestOptionsWithoutMethodOrBody = {},
) {
  return request<T>(path, {
    ...options,
    method: "PATCH",
    body,
  });
}

function del<T>(
  path: string,
  body?: RequestBody,
  options: RequestOptionsWithoutMethodOrBody = {},
) {
  return request<T>(path, {
    ...options,
    method: "DELETE",
    body,
  });
}

export { del as delete };

async function executeRequest(
  path: string,
  options: HttpRequestOptions,
): Promise<Response> {
  const response = await send(path, options);

  if (response.status !== 401 || options.skipRefreshRetry) {
    return handleUnauthorizedResponse(response, options);
  }

  const refreshed = await tryRefreshTokens();
  if (!refreshed) {
    throw handleUnauthorizedFailure();
  }

  const retriedResponse = await send(path, {
    ...options,
    skipRefreshRetry: true,
  });
  return handleUnauthorizedResponse(retriedResponse, options);
}

async function send(
  path: string,
  options: HttpRequestOptions,
): Promise<Response> {
  const context = await buildRequestContext(path, options);
  return fetchWithTimeout(context);
}

async function buildRequestContext(
  path: string,
  options: HttpRequestOptions,
): Promise<HttpRequestContext> {
  const headers = new Headers(options.headers);
  const method = normalizeMethod(options.method);
  const body = normalizeBody(options.body, headers, method);
  ensureJsonContentType(headers, body);

  if (!options.skipAuth) {
    injectAccessToken(headers);
  }

  let context: HttpRequestContext = {
    ...options,
    body,
    headers,
    method,
    timeout: normalizeTimeout(options.timeout),
    url: resolveUrl(path),
  };

  for (const interceptor of requestInterceptors) {
    context = await interceptor(context);
  }

  return context;
}

async function fetchWithTimeout(
  context: HttpRequestContext,
): Promise<Response> {
  const controller = new AbortController();
  const abortHandler = () => {
    controller.abort();
  };
  const timeoutId =
    context.timeout > 0
      ? setTimeout(() => controller.abort(), context.timeout)
      : null;

  if (context.signal) {
    if (context.signal.aborted) {
      controller.abort();
    } else {
      context.signal.addEventListener("abort", abortHandler, { once: true });
    }
  }

  try {
    const { timeout, url, ...requestInit } = context;
    logRequestPayload(context);
    return await fetch(url, {
      ...requestInit,
      headers: context.headers,
      signal: controller.signal,
    });
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    context.signal?.removeEventListener("abort", abortHandler);
  }
}

async function parseResponseData<T>(
  response: Response,
  options: HttpRequestOptions,
): Promise<T> {
  await ensureSuccessfulResponse(response);

  const payload = await readResponsePayload(response);
  if (options.skipEnvelope) {
    return payload as T;
  }

  if (!isApiEnvelope(payload)) {
    throw new AppError("business", "Invalid API response envelope", {
      status: response.status,
      code: "INVALID_ENVELOPE",
      details: payload,
      retryable: false,
    });
  }

  if (payload.code !== 0) {
    throw createEnvelopeError(payload, response.status);
  }

  return payload.data as T;
}

async function ensureSuccessfulResponse(response: Response) {
  if (response.ok) {
    return;
  }

  const payload = await readResponsePayload(response);
  if (isApiEnvelope(payload)) {
    throw createEnvelopeError(payload, response.status);
  }

  throw toAppError({
    status: response.status,
    body: typeof payload === "string" ? payload : safeStringify(payload),
    code: "HTTP_ERROR",
    details: payload,
  });
}

async function readResponsePayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const text = await response.text();
  if (!text) {
    return undefined;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return text;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createEnvelopeError(payload: ApiEnvelope, status?: number) {
  return new AppError(
    resolveErrorType(status),
    payload.message || "Request failed",
    {
      status,
      code: String(payload.code),
      details: payload.data,
      retryable: isRetryableStatus(status),
    },
  );
}

function resolveErrorType(status?: number) {
  if (status === 401 || status === 403) {
    return "auth" as const;
  }

  if (status === 400 || status === 422) {
    return "validation" as const;
  }

  if (
    status === 408 ||
    status === 429 ||
    (status !== undefined && status >= 500)
  ) {
    return "network" as const;
  }

  return "business" as const;
}

function isApiEnvelope(payload: unknown): payload is ApiEnvelope {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as ApiEnvelope).code === "number" &&
    typeof (payload as ApiEnvelope).message === "string" &&
    "data" in payload
  );
}

function handleUnauthorizedResponse(
  response: Response,
  options: HttpRequestOptions,
) {
  if (response.status !== 401 || options.skipUnauthorizedRedirect) {
    return response;
  }

  throw handleUnauthorizedFailure();
}

function handleUnauthorizedFailure() {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
  }

  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }

  return new AuthError("Unauthorized", {
    status: 401,
    code: "UNAUTHORIZED",
  });
}

async function tryRefreshTokens() {
  const refreshToken =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("refreshToken")
      : null;

  if (!refreshToken) {
    return false;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const tokens = await request<{
        accessToken: string;
        refreshToken: string;
      }>("/auth/refresh", {
        method: "POST",
        body: { refreshToken },
        skipAuth: true,
        skipRefreshRetry: true,
        skipUnauthorizedRedirect: true,
      });

      localStorage.setItem("accessToken", tokens.accessToken);
      localStorage.setItem("refreshToken", tokens.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function injectAccessToken(headers: Headers) {
  const token =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("accessToken")
      : null;

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
}

function normalizeBody(
  body: RequestBody | undefined,
  headers: Headers,
  method: string,
) {
  if (body === undefined || body === null) {
    if (methodAllowsRequestBody(method)) {
      return JSON.stringify({});
    }
    return undefined;
  }

  if (isNativeBody(body)) {
    if (isFormDataBody(body)) {
      headers.delete("Content-Type");
    }
    return body;
  }

  return JSON.stringify(body);
}

function ensureJsonContentType(headers: Headers, body: RequestBody | undefined) {
  if (isFormDataBody(body)) {
    return;
  }

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
}

function isFormDataBody(body: unknown): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

function isNativeBody(body: RequestBody): body is BodyInit {
  return (
    typeof body === "string" ||
    (typeof Blob !== "undefined" && body instanceof Blob) ||
    (typeof FormData !== "undefined" && body instanceof FormData) ||
    (typeof URLSearchParams !== "undefined" &&
      body instanceof URLSearchParams) ||
    (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  );
}

function normalizeMethod(method?: string) {
  return (method ?? "GET").toUpperCase();
}

function methodAllowsRequestBody(method: string) {
  return method !== "GET" && method !== "HEAD";
}

function normalizeTimeout(timeout?: number) {
  if (timeout === 0) {
    return 0;
  }

  return timeout ?? DEFAULT_TIMEOUT;
}

function resolveUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  return `${API_BASE}${path}`;
}

function collectHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

function logRequestPayload(context: HttpRequestContext) {
  if (!import.meta.env.DEV) {
    return;
  }

  const payload = readRequestPayload(context.body);
  const sanitizedPayload = redactSensitivePayload(payload);

  console.debug("[http] request payload", {
    method: context.method,
    url: context.url,
    payload: sanitizedPayload,
  });
}

function readRequestPayload(body: RequestBody | undefined) {
  if (body === undefined || body === null) {
    return {};
  }

  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) {
      return {};
    }

    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return trimmed;
    }
  }

  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return Object.fromEntries(body.entries());
  }

  if (isFormDataBody(body)) {
    return "[FormData]";
  }

  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return `[Blob:${body.type || "application/octet-stream"}]`;
  }

  if (
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    (typeof ReadableStream !== "undefined" && body instanceof ReadableStream)
  ) {
    return "[Binary]";
  }

  return body;
}

function redactSensitivePayload(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload.map((item) => redactSensitivePayload(item));
  }

  if (payload && typeof payload === "object") {
    const masked: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
      masked[key] = /password/i.test(key)
        ? "***"
        : redactSensitivePayload(value);
    }

    return masked;
  }

  return payload;
}

function safeStringify(payload: unknown) {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function isRetryableStatus(status?: number) {
  if (typeof status !== "number") {
    return false;
  }

  return status === 408 || status === 425 || status === 429 || status >= 500;
}
