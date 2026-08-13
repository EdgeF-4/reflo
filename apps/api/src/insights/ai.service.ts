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
      this.logger.warn(
        `could not read optional provider config: ${(err as Error).message}. Next: fix the JSON file at AI_CONFIG_PATH or remove it to use deterministic insights.`,
      );
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
        let detail = '';
        try {
          detail = (await res.text()).slice(0, 300);
        } catch (bodyError) {
          detail = `response body unavailable: ${(bodyError as Error).message}`;
        }
        this.logger.warn(
          `optional provider returned ${res.status}${detail ? `: ${detail}` : ''}. Next: verify the provider URL, model, and credential or remove the config to use deterministic insights.`,
        );
        return null;
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        this.logger.warn(
          'optional provider response omitted choices[0].message.content. Next: verify the configured model supports chat completions or remove the config to use deterministic insights.',
        );
        return null;
      }
      return content;
    } catch (err) {
      this.logger.warn(
        `optional provider request failed: ${(err as Error).message}. Next: verify provider reachability or remove the config to use deterministic insights.`,
      );
      return null;
    }
  }

  get configured(): boolean {
    return this.provider() !== null;
  }
}
