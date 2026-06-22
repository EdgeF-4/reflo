import { Controller, Get } from '@nestjs/common';
import { DbService } from '../db/db.service';

@Controller()
export class HealthController {
  constructor(private readonly db: DbService) {}

  @Get('health')
  async health() {
    let database = 'down';
    try {
      await this.db.runAdmin((q) => q.query('SELECT 1'));
      database = 'up';
    } catch {
      database = 'down';
    }
    return { status: database === 'up' ? 'ok' : 'degraded', database };
  }
}
