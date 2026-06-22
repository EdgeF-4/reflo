import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { CatalogService } from './catalog.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles, RolesGuard } from '../auth/roles';
import { CurrentUser } from '../auth/current-user';
import { AuthContext } from '../auth/auth-context';
import type { CommissionRule } from '@reflo/domain';

class CreateOfferDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsString() destinationUrl: string;
  @IsObject() defaultRule: CommissionRule;
}
class CreatePartnerDto {
  @IsString() name: string;
  @IsString() email: string;
}
class CreateRuleDto {
  @IsString() offerId: string;
  @IsOptional() @IsString() partnerId?: string;
  @IsObject() rule: CommissionRule;
  @IsOptional() priority?: number;
}

@Controller('offers')
@UseGuards(JwtGuard, RolesGuard)
export class OffersController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @Roles('owner', 'admin', 'analyst')
  list(@CurrentUser() user: AuthContext) {
    return this.catalog.listOffers(user);
  }

  @Post()
  @Roles('owner', 'admin')
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateOfferDto) {
    return this.catalog.createOffer(user, dto);
  }
}

@Controller('partners')
@UseGuards(JwtGuard, RolesGuard)
export class PartnersController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @Roles('owner', 'admin', 'analyst')
  list(@CurrentUser() user: AuthContext) {
    return this.catalog.listPartners(user);
  }

  @Post()
  @Roles('owner', 'admin')
  create(@CurrentUser() user: AuthContext, @Body() dto: CreatePartnerDto) {
    return this.catalog.createPartner(user, dto);
  }
}

@Controller('commission-rules')
@UseGuards(JwtGuard, RolesGuard)
export class CommissionController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @Roles('owner', 'admin', 'analyst')
  list(@CurrentUser() user: AuthContext, @Query('offerId') offerId?: string) {
    return this.catalog.listRules(user, offerId);
  }

  @Post()
  @Roles('owner', 'admin')
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateRuleDto) {
    return this.catalog.createRule(user, dto);
  }
}
