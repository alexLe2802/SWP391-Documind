import { clearStoredAuthToken, notifyUnauthorized } from "./auth-token";

// Chuyển đổi hoặc chuẩn hóa api base url.
export function normalizeApiBaseUrl(value: string) {
  const baseUrl = value.replace(/\/+$/, "");
  return baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
}

// Keep browser requests on the frontend origin. Next.js proxies /api to the
// configured backend, so transient upstream responses cannot be hidden by the
// browser as CORS failures.
export const API_BASE_URL = "/api";
const API_REQUEST_TIMEOUT_MS = 20_000;

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | Record<string, unknown> | null;
  preserveSessionOnUnauthorized?: boolean;
};

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  meta?: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  timestamp?: string;
  path?: string;
  requestId?: string | null;
};

export class ApiError extends Error {
  status: number;

  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Thực hiện chức năng api yêu cầu.
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { preserveSessionOnUnauthorized = false, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  let body = requestOptions.body;

  if (body && !(body instanceof FormData) && typeof body !== "string") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }

  const timeoutSignal = AbortSignal.timeout(API_REQUEST_TIMEOUT_MS);
  const signal = requestOptions.signal
    ? AbortSignal.any([requestOptions.signal, timeoutSignal])
    : timeoutSignal;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    body,
    headers,
    signal,
    credentials: "include",
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type");
  const data = (
    contentType?.includes("application/json") ? await response.json() : null
  ) as ApiEnvelope<T> | T | null;

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? (data.error?.message ?? "Request failed")
        : "Request failed";

    if (response.status === 401 && !preserveSessionOnUnauthorized) {
      clearStoredAuthToken();
      notifyUnauthorized();
    }

    throw new ApiError(message, response.status);
  }

  if (data && typeof data === "object" && "success" in data && data.success) {
    if (data.meta && Array.isArray(data.data)) {
      return {
        items: data.data,
        meta: data.meta,
      } as T;
    }

    return data.data as T;
  }

  return data as T;
}
