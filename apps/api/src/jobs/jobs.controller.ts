import { Controller, Get, Query } from '@nestjs/common';
import type { JobsResponse } from '@bini/types';
import { JobsService } from './jobs.service';

/** page 쿼리 상한 — 비정상적으로 큰 값으로 불필요한 스크래핑을 유발하지 않도록 클램프. */
const MAX_PAGE = 500;

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  /**
   * GET /api/jobs?page=N — 원화 공고 N페이지를 등록일순으로 반환한다.
   * page는 양의 정수만 허용한다. 누락·비정규(소수/지수/문자 포함) 값은 1로 보정하고,
   * 상한 MAX_PAGE로 클램프한다. 배열로 들어오면 첫 값을 사용한다.
   * 게임잡 스크래핑 실패 시 JobsService가 BadGatewayException(502)을 던지며 그대로 전파된다.
   */
  @Get()
  async getJobs(@Query('page') page?: string | string[]): Promise<JobsResponse> {
    const rawValue = Array.isArray(page) ? page[0] : page;
    const raw = (rawValue ?? '').trim();
    const parsed = /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
    const pageNum =
      Number.isNaN(parsed) || parsed < 1 ? 1 : Math.min(parsed, MAX_PAGE);
    return this.jobsService.getJobsPage(pageNum);
  }
}
