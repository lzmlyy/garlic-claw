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

export interface HttpRequestErrorEvent {
  path: string;
  method: string;
  url: string;
  error: AppError;
}

export type HttpRequestInterceptor = (
  context: HttpRequestContext,
) => MaybePromise<HttpRequestContext>;
export type HttpRequestErrorListener = (
  event: HttpRequestErrorEvent,
) => void;

const requestInterceptors = new Set<HttpRequestInterceptor>();
const requestErrorListeners = new Set<HttpRequestErrorListener>();

let refreshPromise: Promise<boolean> | null = null;

export function getApiBase(): string {
  return API_BASE;
}

export function addRequestInterceptor(
  interceptor: HttpRequestInterceptor,
): () => void {
  requestInterceptors.add(interceptor);

  return () => {
    requestInterceptors.delete(interceptor);
  };
}

export function addRequestErrorListener(
  listener: HttpRequestErrorListener,
): () => void {
  requestErrorListeners.add(listener);

  return () => {
    requestErrorListeners.delete(listener);
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
    throw toLoggedAppError(path, options, error);
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
    throw toLoggedAppError(path, options, error);
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
    throw toLoggedAppError(path, options, error);
  }
}

export function get<T>(
  path: string,
  options: RequestOptionsWithoutMethodOrBody = {},
): Promise<T> {
  return request<T>(path, {
    ...options,
    method: "GET",
  });
}

export function post<T>(
  path: string,
  body?: RequestBody,
  options: RequestOptionsWithoutMethodOrBody = {},
): Promise<T> {
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
): Promise<T> {
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
): Promise<T> {
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
): Promise<T> {
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
  let timedOut = false;
  const abortHandler = () => {
    controller.abort();
  };
  const timeoutId =
    context.timeout > 0
      ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, context.timeout)
      : null;

  if (context.signal) {
    if (context.signal.aborted) {
      controller.abort();
    } else {
      context.signal.addEventListener("abort", abortHandler, { once: true });
    }
  }

  try {
    const { timeout: _timeout, url, ...requestInit } = context;
    return await fetch(url, {
      ...requestInit,
      headers: context.headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) {
      throw new AppError("network", "请求超时，请稍后重试", {
        status: 408,
        code: "TIMEOUT",
        originalError: error,
        retryable: true,
      });
    }
    throw error;
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

  const envelope = requireApiEnvelope(payload, response.status);

  if (envelope.code !== 0) {
    throw createEnvelopeError(envelope, response.status);
  }

  return envelope.data as T;
}

async function ensureSuccessfulResponse(response: Response) {
  if (response.ok) {
    return;
  }

  const payload = await readResponsePayload(response);
  if (isApiEnvelope(payload)) {
    throw createEnvelopeError(payload, response.status);
  }

  throw ensureErrorCode(toAppError({
    status: response.status,
    body: typeof payload === "string" ? payload : safeStringify(payload),
    code: "HTTP_ERROR",
    details: payload,
  }), "HTTP_ERROR");
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

function requireApiEnvelope(
  payload: unknown,
  status?: number,
): ApiEnvelope {
  if (isApiEnvelope(payload)) {
    return payload;
  }

  throw new AppError("business", "Invalid API response envelope", {
    status,
    code: "INVALID_ENVELOPE",
    details: payload,
    retryable: false,
  });
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

function safeStringify(payload: unknown) {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function ensureErrorCode(error: AppError, fallbackCode: string): AppError {
  if (error.code) {
    return error;
  }

  return new AppError(error.type, error.message, {
    status: error.status,
    code: fallbackCode,
    details: error.details,
    originalError: error.originalError,
    retryable: error.retryable,
  });
}

function toLoggedAppError(
  path: string,
  options: HttpRequestOptions,
  error: unknown,
): AppError {
  const appError = toAppError(error);
  const method = normalizeMethod(options.method);
  const url = resolveUrl(path);
  logRequestError(method, url, appError);
  emitRequestError({
    path,
    method,
    url,
    error: appError,
  });
  return appError;
}

function logRequestError(
  method: string,
  url: string,
  error: AppError,
): void {
  if (!import.meta.env.DEV) {
    return;
  }

  console.error("[http] request failed", {
    method,
    url,
    status: error.status ?? null,
    code: error.code ?? null,
    message: error.message,
  });
}

function emitRequestError(event: HttpRequestErrorEvent): void {
  for (const listener of requestErrorListeners) {
    try {
      listener(event);
    } catch (listenerError) {
      if (!import.meta.env.DEV) {
        continue;
      }

      console.error("[http] request error listener failed", listenerError);
    }
  }
}

function isRetryableStatus(status?: number) {
  if (typeof status !== "number") {
    return false;
  }

  return status === 408 || status === 425 || status === 429 || status >= 500;
}
