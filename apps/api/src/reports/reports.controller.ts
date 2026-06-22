import { Controller, Get, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser } from '../auth/current-user';
import { AuthContext } from '../auth/auth-context';

@Controller('reports')
@UseGuards(JwtGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @Roles('owner', 'admin', 'analyst')
  summary(@CurrentUser() user: AuthContext) {
    return this.reports.summary(user);
  }

  @Get('partners')
  @Roles('owner', 'admin', 'analyst')
  partners(@CurrentUser() user: AuthContext) {
    return this.reports.partners(user);
  }

  @Get('fraud')
  @Roles('owner', 'admin', 'analyst')
  fraud(@CurrentUser() user: AuthContext) {
    return this.reports.fraud(user);
  }

  @Get('audit')
  @Roles('owner', 'admin')
  audit(@CurrentUser() user: AuthContext) {
    return this.reports.audit(user);
  }
}
