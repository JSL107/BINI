import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
} from '@nestjs/common';
import type { CareerSitesResponse, CompanyDetailResponse } from '@bini/types';
import { CompaniesService } from './companies.service';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get('career-sites')
  getCareerSites(): Promise<CareerSitesResponse> {
    return this.companies.getCareerSites();
  }

  /**
   * GET /api/companies/by-name?q=<encoded-company-name>
   *
   * Vercel/Next.js URL은 unicode percent-encoded query를 그대로 받으므로
   * 별도 slug 매핑 테이블 없이 회사명 자체를 키로 쓴다. 회사명 변경 빈도가
   * 거의 없고 미래에 slug 컬럼 추가 시 이 endpoint를 alias로 유지 가능.
   */
  @Get('by-name')
  async getByName(
    @Query('q') q?: string | string[],
  ): Promise<CompanyDetailResponse> {
    const raw = Array.isArray(q) ? q[0] : q;
    const name = (raw ?? '').trim();
    if (!name) {
      throw new BadRequestException('q query parameter is required');
    }
    const data = await this.companies.getCompanyByName(name);
    if (!data) {
      throw new NotFoundException(`회사를 찾을 수 없습니다: ${name}`);
    }
    return data;
  }
}
