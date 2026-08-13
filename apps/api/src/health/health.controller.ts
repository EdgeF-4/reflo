import { Controller, Get, Logger } from '@nestjs/common';
import { DbService } from '../db/db.service';

@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly db: DbService) {}

  @Get('health')
  async health() {
    let database = 'down';
    try {
      await this.db.runAdmin((q) => q.query('SELECT 1'));
      database = 'up';
    } catch (err) {
      this.logger.error(
        `database health check failed: ${(err as Error).message}. Next: run \`docker compose ps db\` and \`docker compose logs db\`, restore PostgreSQL, then retry /health.`,
      );
      return {
        status: 'degraded',
        database: 'down',
        nextAction: 'run `docker compose ps db` and `docker compose logs db`, restore PostgreSQL, then retry /health.',
      };
    }
    return { status: database === 'up' ? 'ok' : 'degraded', database };
  }
}
