import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { TrackingController } from './tracking/tracking.controller';
import { TrackingService } from './tracking/tracking.service';
import { QueueService } from './queue/queue.service';
import { CatalogService } from './catalog/catalog.service';
import { OffersController, PartnersController, CommissionController } from './catalog/catalog.controllers';
import { LedgerService } from './ledger/ledger.service';
import { LedgerController } from './ledger/ledger.controller';
import { ReportsService } from './reports/reports.service';
import { ReportsController } from './reports/reports.controller';
import { AiService } from './insights/ai.service';
import { InsightsService } from './insights/insights.service';
import { InsightsController } from './insights/insights.controller';
import { PortalController } from './portal/portal.controller';

/**
 * The application graph. DbService and AuditService are the shared core; every
 * feature service depends on DbService to obtain a tenant-scoped connection.
 */
@Module({
  imports: [CoreModule, AuthModule],
  controllers: [
    HealthController,
    TrackingController,
    OffersController,
    PartnersController,
    CommissionController,
    LedgerController,
    ReportsController,
    InsightsController,
    PortalController,
  ],
  providers: [
    TrackingService,
    QueueService,
    CatalogService,
    LedgerService,
    ReportsService,
    AiService,
    InsightsService,
  ],
})
export class AppModule {}
