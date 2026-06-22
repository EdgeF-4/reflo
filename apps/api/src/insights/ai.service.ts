import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, existsSync } from 'node:fs';
import { loadConfig } from '../config';

interface AiProviderConfig {
  /** OpenAI-compatible base URL. Defaults to NVIDIA NIM. */
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

/**
 * Provider-agnostic large-language-model client.
 *
 * Configuration is read from a chmod-600 config.json that is never committed and
 * never an environment variable, keeping the key off the process environment and
 * out of logs. When no key is configured the service returns null from chat()
 * and every caller falls back to a deterministic, rule-based explanation, so the
 * platform is fully functional with zero secrets.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  private provider(): AiProviderConfig | null {
    const path = loadConfig().aiConfigPath;
    if (!existsSync(path)) return null;
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as { ai?: AiProviderConfig };
      const ai = raw.ai ?? (raw as AiProviderConfig);
      if (!ai.apiKey) return null;
      return {
        baseUrl: ai.baseUrl ?? 'https://integrate.api.nvidia.com/v1',
        apiKey: ai.apiKey,
        model: ai.model ?? 'meta/llama-3.1-8b-instruct',
      };
    } catch (err) {
      this.logger.warn(`could not read AI config: ${(err as Error).message}`);
      return null;
    }
  }

  /** Returns the model's reply, or null when no provider is configured. */
  async chat(system: string, user: string): Promise<string | null> {
    const cfg = this.provider();
    if (!cfg) return null;
    try {
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.2,
          max_tokens: 400,
        }),
      });
      if (!res.ok) {
        this.logger.warn(`AI provider returned ${res.status}`);
        return null;
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return json.choices?.[0]?.message?.content ?? null;
    } catch (err) {
      this.logger.warn(`AI request failed: ${(err as Error).message}`);
      return null;
    }
  }

  get configured(): boolean {
    return this.provider() !== null;
  }
}
