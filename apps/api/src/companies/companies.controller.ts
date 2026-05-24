import { Controller, Get } from '@nestjs/common';
import type { CareerSitesResponse } from '@bini/types';
import { CompaniesService } from './companies.service';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get('career-sites')
  getCareerSites(): Promise<CareerSitesResponse> {
    return this.companies.getCareerSites();
  }
}
