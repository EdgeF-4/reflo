import { Body, Controller, Post } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TrackingService } from './tracking.service';
import type { AttributionModel } from '@reflo/domain';

class EventDto {
  @IsString() publicKey: string;
  @IsIn(['click', 'lead_submit']) type: 'click' | 'lead_submit';
  @IsString() sourceSite: string;
  @IsOptional() @IsString() partnerCode?: string;
  @IsOptional() @IsString() customerRef?: string;
  @IsOptional() @IsString() country?: string;
}

class ConversionDto {
  @IsString() publicKey: string;
  @IsString() orderId: string;
  @IsInt() @Min(0) amountCents: number;
  @IsString() customerRef: string;
  @IsString() sourceSite: string;
  @IsOptional() @IsString() model?: AttributionModel;
  @IsOptional() @IsString() country?: string;
}

/**
 * Public ingest endpoints. These are authenticated by the tracking key and its
 * allowed-domain list rather than a user session, because they are called from
 * partner sites and merchant back ends.
 */
@Controller('track')
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Post('event')
  event(@Body() dto: EventDto) {
    return this.tracking.recordEvent(dto);
  }

  @Post('conversion')
  conversion(@Body() dto: ConversionDto) {
    return this.tracking.recordConversion(dto);
  }
}
