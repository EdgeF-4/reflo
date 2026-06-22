import { Controller, Get, Header } from '@nestjs/common';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Serves the embeddable tracking widget so a site can load it by script tag. */
@Controller()
export class WidgetController {
  private readonly source = this.load();

  private load(): string {
    const candidates = [
      process.env.WIDGET_PATH,
      join(process.cwd(), '..', '..', 'packages', 'widget', 'reflo.js'),
      '/app/packages/widget/reflo.js',
      join(__dirname, '..', '..', '..', '..', 'packages', 'widget', 'reflo.js'),
    ].filter(Boolean) as string[];
    for (const path of candidates) {
      if (existsSync(path)) return readFileSync(path, 'utf8');
    }
    return '/* reflo widget source not found */';
  }

  @Get('reflo.js')
  @Header('content-type', 'application/javascript; charset=utf-8')
  @Header('cache-control', 'public, max-age=300')
  widget(): string {
    return this.source;
  }
}
