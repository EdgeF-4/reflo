import { Global, Module } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';

/** Shared infrastructure available to every module: the connection pools and
 * the audit writer. Global so the auth layer can inject DbService too. */
@Global()
@Module({
  providers: [DbService, AuditService],
  exports: [DbService, AuditService],
})
export class CoreModule {}
