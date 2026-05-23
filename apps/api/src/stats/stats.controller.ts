import { Controller, Get } from '@nestjs/common';
import type { StatsResponse } from '@bini/types';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  getStats(): Promise<StatsResponse> {
    return this.stats.getStats();
  }
}
