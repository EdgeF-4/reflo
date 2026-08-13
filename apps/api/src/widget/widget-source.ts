import { existsSync, readFileSync } from 'node:fs';

export function loadWidgetSource(candidates: string[]): string {
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      return readFileSync(path, 'utf8');
    } catch (err) {
      throw new Error(
        `could not read the Reflo widget at ${path}: ${(err as Error).message}. Next: make that file readable by the API process or correct WIDGET_PATH, then restart the API.`,
      );
    }
  }
  throw new Error(
    `could not locate the Reflo widget (looked in: ${candidates.join(', ')}). Next: package packages/widget/reflo.js or set WIDGET_PATH to that file, then restart the API.`,
  );
}
