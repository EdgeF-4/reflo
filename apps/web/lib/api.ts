/** Browser-side client for the Reflo API. The base URL is injected at build
 * time; the token is read from localStorage on each call. */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:4000';
export const ACTIONABLE_ERROR_EVENT = 'reflo:actionable-error';

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
    const message = `Could not save the session: ${errorText(err)}. Next: allow first-party browser storage, then sign in again.`;
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

export function reportActionableError(message: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent<string>(ACTIONABLE_ERROR_EVENT, { detail: message }));
  } catch (err) {
    console.error(
      `${message} Browser error notification also failed: ${errorText(err)}. Next: inspect the browser console and integration code before retrying.`,
    );
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
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
  login: (tenantSlug: string, email: string, password: string) =>
    request<{ token: string; user: SessionUser }>('POST', '/auth/login', { tenantSlug, email, password }),
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
};
