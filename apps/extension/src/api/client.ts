import { API_BASE_URL, STORAGE_KEYS } from "../config";
import type { AuthSession } from "../types";
import { readStored, removeStored } from "../utils/storage";

/** A failed API call. `status === 0` means the API could not be reached. */
export class ApiError extends Error {
  readonly status: number;
  /** Field-level messages from Nest's ValidationPipe, when present. */
  readonly details: string[];

  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }

  get isUnreachable(): boolean {
    return this.status === 0;
  }

  /** Wrong email or password — as opposed to a rejected or expired token. */
  get isBadCredentials(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** The API is down, unreachable, or its database is unavailable. */
  get isServiceFault(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Attach the stored bearer token. Off for register/login. */
  auth?: boolean;
  signal?: AbortSignal;
}

/** Shape of Nest's default error responses. */
interface ErrorPayload {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

async function authHeader(): Promise<Record<string, string>> {
  const session = await readStored<AuthSession>(STORAGE_KEYS.session);
  return session?.accessToken
    ? { Authorization: `Bearer ${session.accessToken}` }
    : {};
}

function describeError(status: number, payload: ErrorPayload | null): ApiError {
  const raw = payload?.message;
  const details = Array.isArray(raw) ? raw : [];

  if (details.length > 0) {
    return new ApiError(status, details.join(". "), details);
  }

  if (typeof raw === "string" && raw.length > 0) {
    return new ApiError(status, raw, details);
  }

  // No usable message: a proxy error page, an empty body, or an unhandled
  // server fault. Never show the user a bare status code.
  return new ApiError(
    status,
    status >= 500
      ? "The WebMind service is having trouble. Please try again in a moment."
      : `The request was rejected (status ${status}).`,
    details,
  );
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, auth = true, signal } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) Object.assign(headers, await authHeader());

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError(0, `Cannot reach the WebMind API at ${API_BASE_URL}`);
  }

  if (response.ok) {
    return response.status === 204
      ? (undefined as T)
      : ((await response.json()) as T);
  }

  // An expired or revoked token is worth discarding so the panel returns to
  // the sign-in screen instead of retrying with a dead credential.
  if (response.status === 401 && auth) {
    await removeStored(STORAGE_KEYS.session);
  }

  const payload = (await response.json().catch(() => null)) as ErrorPayload | null;
  throw describeError(response.status, payload);
}
