import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { loadConfig } from '../config';
import { LedgerService } from '../ledger/ledger.service';

const QUEUE_NAME = 'settlement';

interface AutoConfirmJob {
  tenantId: string;
  entryId: string;
}

/**
 * Background settlement jobs backed by Redis and BullMQ. Accrued ledger entries
 * are scheduled to auto-confirm after a short hold window, mirroring how a real
 * program waits out a return period before a commission becomes payable. If no
 * Redis URL is configured the methods become no-ops, so the API still runs in a
 * minimal single-container setup.
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private connection?: IORedis;
  private queue?: Queue;
  private worker?: Worker;

  constructor(private readonly ledger: LedgerService) {}

  onModuleInit(): void {
    const cfg = loadConfig();
    if (!cfg.redisUrl || !cfg.startWorker) {
      this.logger.log('Redis not configured; settlement queue disabled');
      return;
    }
    this.connection = new IORedis(cfg.redisUrl, { maxRetriesPerRequest: null });
    const connection = this.connection as unknown as ConnectionOptions;
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.worker = new Worker<AutoConfirmJob>(
      QUEUE_NAME,
      async (job) => {
        if (job.name === 'auto-confirm') {
          return this.ledger.systemTransition(job.data.tenantId, job.data.entryId, 'confirmed');
        }
        throw new Error(
          `unsupported settlement job ${job.name}. Next: remove or migrate that queued job, then restart the worker.`,
        );
      },
      { connection },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(
        `job ${job?.id} failed: ${err.message}. Next: inspect the entry state and Redis health, then retry only if the transition is still valid.`,
      ),
    );
    this.connection.on('error', (err) =>
      this.logger.error(
        `Redis connection failed: ${err.message}. Next: run \`docker compose ps redis\` and \`docker compose logs redis\`, restore Redis, then restart the API.`,
      ),
    );
    this.logger.log('settlement queue worker started');
  }

  /** Schedule a pending entry to auto-confirm after the hold window. */
  async enqueueAutoConfirm(tenantId: string, entryId: string, delayMs = 15_000): Promise<void> {
    if (!this.queue) return;
    await this.queue.add('auto-confirm', { tenantId, entryId }, { delay: delayMs, removeOnComplete: true });
  }

  async onModuleDestroy(): Promise<void> {
    const results = await Promise.allSettled([this.worker?.close(), this.queue?.close()]);
    const failed = results.filter((result) => result.status === 'rejected') as PromiseRejectedResult[];
    if (failed.length) {
      this.logger.error(
        `settlement queue shutdown failed: ${failed.map((result) => String(result.reason)).join('; ')}. Next: inspect active jobs and Redis health, then retry shutdown before restarting the API.`,
      );
    }
    try {
      this.connection?.disconnect();
    } catch (err) {
      this.logger.error(
        `Redis disconnect failed: ${(err as Error).message}. Next: inspect Redis clients, then stop the connection before restarting the API.`,
      );
    }
  }
}
