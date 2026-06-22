/** Browser-side client for the Reflo API. The base URL is injected at build
 * time; the token is read from localStorage on each call. */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:4000';

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
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as SessionUser) : null;
}

export function setSession(token: string, user: SessionUser): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (tenantSlug: string, email: string, password: string) =>
    request<{ token: string; user: SessionUser }>('POST', '/auth/login', { tenantSlug, email, password }),
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
};
