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
    } catch (err) {
      throw new Error(
        `could not read MCP config ${path}: ${(err as Error).message}. Next: correct the JSON or remove the file to use documented local defaults, then restart the MCP process.`,
      );
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

  private async call(path: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(`${this.cfg.apiUrl}${path}`, init);
    } catch (err) {
      throw new Error(
        `cannot reach Reflo API at ${this.cfg.apiUrl}. Next: start the demo with \`docker compose up --build\`, verify /health, then retry. Cause: ${(err as Error).message}`,
      );
    }
  }

  private async failure(res: Response, operation: string): Promise<Error> {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300);
    } catch (err) {
      detail = `response body unavailable: ${(err as Error).message}`;
    }
    return new Error(
      `${operation} failed with HTTP ${res.status}${detail ? `: ${detail}` : ''}. Next: verify the configured account, route, and running API, then retry.`,
    );
  }

  private async ensureToken(): Promise<string> {
    if (this.token) return this.token;
    const res = await this.call('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantSlug: this.cfg.tenantSlug,
        email: this.cfg.email,
        password: this.cfg.password,
      }),
    });
    if (!res.ok) throw await this.failure(res, 'login');
    const json = (await res.json()) as { token: string };
    this.token = json.token;
    return this.token;
  }

  async get(path: string): Promise<unknown> {
    const token = await this.ensureToken();
    const res = await this.call(path, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw await this.failure(res, `GET ${path}`);
    return res.json();
  }

  async post(path: string, body: unknown): Promise<unknown> {
    const token = await this.ensureToken();
    const res = await this.call(path, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await this.failure(res, `POST ${path}`);
    return res.json();
  }
}
