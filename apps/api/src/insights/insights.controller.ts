import { Controller, Get, UseGuards } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { AiService } from './ai.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser } from '../auth/current-user';
import { AuthContext } from '../auth/auth-context';

@Controller('insights')
@UseGuards(JwtGuard, RolesGuard)
export class InsightsController {
  constructor(
    private readonly insights: InsightsService,
    private readonly ai: AiService,
  ) {}

  @Get('partners')
  @Roles('owner', 'admin', 'analyst')
  partners(@CurrentUser() user: AuthContext) {
    return this.insights.partnerInsights(user);
  }

  @Get('status')
  @Roles('owner', 'admin', 'analyst')
  status() {
    return { aiConfigured: this.ai.configured };
  }
}
