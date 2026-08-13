import { Controller, Get, Header } from '@nestjs/common';
import { join } from 'node:path';
import { loadWidgetSource } from './widget-source';

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
    return loadWidgetSource(candidates);
  }

  @Get('reflo.js')
  @Header('content-type', 'application/javascript; charset=utf-8')
  @Header('cache-control', 'public, max-age=300')
  widget(): string {
    return this.source;
  }
}
