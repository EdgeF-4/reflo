import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { LedgerService } from './ledger.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser } from '../auth/current-user';
import { AuthContext } from '../auth/auth-context';
import type { LedgerEventType, LedgerState } from '@reflo/domain';

const TRANSITIONS = ['confirmed', 'marked_payable', 'paid', 'reversed', 'clawed_back', 'adjusted'];

class TransitionDto {
  @IsIn(TRANSITIONS) type: LedgerEventType;
  @IsOptional() @IsString() reason?: string;
}

@Controller('ledger')
@UseGuards(JwtGuard, RolesGuard)
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('entries')
  @Roles('owner', 'admin', 'analyst')
  list(@CurrentUser() user: AuthContext, @Query('state') state?: LedgerState) {
    return this.ledger.listEntries(user, state);
  }

  @Get('entries/:id/events')
  @Roles('owner', 'admin', 'analyst')
  history(@CurrentUser() user: AuthContext, @Param('id') id: string) {
    return this.ledger.history(user, id);
  }

  @Post('entries/:id/transition')
  @Roles('owner', 'admin')
  transition(@CurrentUser() user: AuthContext, @Param('id') id: string, @Body() dto: TransitionDto) {
    return this.ledger.transition(user, id, dto.type, dto.reason);
  }

  @Post('payouts/run')
  @Roles('owner', 'admin')
  runPayouts(@CurrentUser() user: AuthContext) {
    return this.ledger.runPayouts(user);
  }
}
