import { readFileSync, existsSync } from 'node:fs';

interface McpConfig {
  apiUrl: string;
  tenantSlug: string;
  email: string;
  password: string;
}

/** Read connection settings from env, falling back to a config.json (chmod 600)
 * and finally to the local demo defaults. Secrets are never required on the
 * command line. */
export function loadMcpConfig(): McpConfig {
  let fromFile: Partial<McpConfig> = {};
  const path = process.env.REFLO_MCP_CONFIG ?? './config.json';
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as { mcp?: Partial<McpConfig> };
      fromFile = raw.mcp ?? {};
    } catch {
      /* ignore malformed config and fall through to defaults */
    }
  }
  return {
    apiUrl: process.env.REFLO_API_URL ?? fromFile.apiUrl ?? 'http://localhost:4000',
    tenantSlug: process.env.REFLO_TENANT ?? fromFile.tenantSlug ?? 'northwind',
    email: process.env.REFLO_EMAIL ?? fromFile.email ?? 'admin@northwind.test',
    password: process.env.REFLO_PASSWORD ?? fromFile.password ?? 'demo1234',
  };
}

/** Thin authenticated client over the Reflo HTTP API. */
export class RefloClient {
  private token?: string;
  constructor(private readonly cfg: McpConfig) {}

  private async ensureToken(): Promise<string> {
    if (this.token) return this.token;
    const res = await fetch(`${this.cfg.apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantSlug: this.cfg.tenantSlug,
        email: this.cfg.email,
        password: this.cfg.password,
      }),
    });
    if (!res.ok) throw new Error(`login failed: HTTP ${res.status}`);
    const json = (await res.json()) as { token: string };
    this.token = json.token;
    return this.token;
  }

  async get(path: string): Promise<unknown> {
    const token = await this.ensureToken();
    const res = await fetch(`${this.cfg.apiUrl}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`GET ${path} failed: HTTP ${res.status}`);
    return res.json();
  }

  async post(path: string, body: unknown): Promise<unknown> {
    const token = await this.ensureToken();
    const res = await fetch(`${this.cfg.apiUrl}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} failed: HTTP ${res.status}`);
    return res.json();
  }
}
