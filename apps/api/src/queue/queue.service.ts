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
        return null;
      },
      { connection },
    );
    this.worker.on('failed', (job, err) => this.logger.warn(`job ${job?.id} failed: ${err.message}`));
    this.logger.log('settlement queue worker started');
  }

  /** Schedule a pending entry to auto-confirm after the hold window. */
  async enqueueAutoConfirm(tenantId: string, entryId: string, delayMs = 15_000): Promise<void> {
    if (!this.queue) return;
    await this.queue.add('auto-confirm', { tenantId, entryId }, { delay: delayMs, removeOnComplete: true });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.worker?.close(), this.queue?.close()]);
    this.connection?.disconnect();
  }
}
