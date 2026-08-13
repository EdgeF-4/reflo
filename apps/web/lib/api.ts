/** Browser-side client for the Reflo API. The base URL is injected at build
 * time; the token is read from localStorage on each call. */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:4000';
export const ACTIONABLE_ERROR_EVENT = 'reflo:actionable-error';
let lastActionableError = '';

const TOKEN_KEY = 'reflo_token';
const USER_KEY = 'reflo_user';

export interface SessionUser {
  userId: string;
  tenantId: string;
  role: 'owner' | 'admin' | 'analyst' | 'partner';
  partnerId?: string | null;
  email: string;
  name?: string;
}

interface LoginResponse {
  token: string;
  user: SessionUser;
}

interface PayoutResponse {
  paidEntries: number;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch (err) {
    reportActionableError(
      `Could not read the saved session: ${errorText(err)}. Next: allow first-party browser storage, then sign in again.`,
    );
    return null;
  }
}

export function getUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(USER_KEY);
  } catch (err) {
    reportActionableError(
      `Could not read the saved user: ${errorText(err)}. Next: allow first-party browser storage, then sign in again.`,
    );
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch (err) {
    reportActionableError(
      `The saved user is invalid: ${errorText(err)}. Next: sign in again to replace the damaged local session.`,
    );
    clearSession();
    return null;
  }
}

export function setSession(token: string, user: SessionUser): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (err) {
    let cleanupDetail = '';
    try {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
    } catch (cleanupError) {
      cleanupDetail = ` Partial-session cleanup also failed: ${errorText(cleanupError)}.`;
    }
    const message = `Could not save the session: ${errorText(err)}.${cleanupDetail} Next: allow first-party browser storage, clear this site's storage if a partial session remains, then sign in again.`;
    reportActionableError(message);
    throw new Error(message);
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  } catch (err) {
    reportActionableError(
      `Could not clear the saved session: ${errorText(err)}. Next: clear this site's storage in the browser, then reload.`,
    );
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function actionable(message: string, fallback: string): string {
  return /\bNext:/.test(message)
    ? message
    : `${message.replace(/[.\s]+$/, '')}. Next: ${fallback}`;
}

export function actionableError(error: unknown, fallback: string): string {
  return actionable(errorText(error), fallback);
}

function loginResponse(value: unknown): LoginResponse {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof (value as { token?: unknown }).token !== 'string' ||
    !(value as { token: string }).token ||
    (value as { user?: unknown }).user === null ||
    typeof (value as { user?: unknown }).user !== 'object' ||
    Array.isArray((value as { user?: unknown }).user)
  ) {
    throw new Error(
      'The login response did not contain a non-empty token and user object. Next: inspect POST /auth/login and restore its documented response shape, then retry.',
    );
  }
  return value as LoginResponse;
}

function payoutResponse(value: unknown): PayoutResponse {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Number.isInteger((value as { paidEntries?: unknown }).paidEntries) ||
    (value as { paidEntries: number }).paidEntries < 0
  ) {
    throw new Error(
      'The payout response did not contain a non-negative integer paidEntries value. Next: inspect POST /ledger/payouts/run and restore its documented response shape, then retry.',
    );
  }
  return value as PayoutResponse;
}

export function reportActionableError(message: string): void {
  if (typeof window === 'undefined') return;
  lastActionableError = message;
  try {
    window.dispatchEvent(new CustomEvent<string>(ACTIONABLE_ERROR_EVENT, { detail: message }));
  } catch (err) {
    try {
      console.error(
        `${message} Browser error notification also failed: ${errorText(err)}. Next: inspect the browser console and integration code before retrying.`,
      );
    } catch {
      // The retained message remains available to ActionableErrorBanner.
    }
  }
}

export function getLastActionableError(): string {
  return lastActionableError;
}

export function clearActionableError(): void {
  lastActionableError = '';
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  let serializedBody: string | undefined;
  try {
    serializedBody = body === undefined ? undefined : JSON.stringify(body);
  } catch (err) {
    throw new Error(
      `Could not serialize the ${method} ${path} request: ${errorText(err)}. Next: remove circular or unsupported values from the request, then retry.`,
    );
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: serializedBody,
    });
  } catch (err) {
    throw new Error(
      `Cannot reach the API at ${API_URL}. Next: confirm the Compose demo is running and retry. Cause: ${(err as Error).message}`,
    );
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch (err) {
      detail = `response body unavailable: ${errorText(err)}`;
    }
    throw new Error(actionable(
      `HTTP ${res.status}: ${detail.slice(0, 200)}`,
      'correct the request or sign in again, then retry.',
    ));
  }
  try {
    return await res.json() as T;
  } catch (err) {
    throw new Error(
      `HTTP ${res.status} returned invalid JSON: ${errorText(err)}. Next: inspect the API and reverse-proxy logs, then retry.`,
    );
  }
}

export const api = {
  login: async (tenantSlug: string, email: string, password: string) =>
    loginResponse(await request<unknown>('POST', '/auth/login', { tenantSlug, email, password })),
  runPayouts: async () =>
    payoutResponse(await request<unknown>('POST', '/ledger/payouts/run', {})),
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
};
