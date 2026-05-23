import { Controller, Get, Query } from '@nestjs/common';
import type { JobsResponse } from '@bini/types';
import { JobsCronService } from './jobs-cron.service';

/** page 쿼리 상한 — 비정상적으로 큰 값으로 의미 없는 페이지네이션 오프셋을 막기 위한 클램프. */
const MAX_PAGE = 500;

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsCron: JobsCronService) {}

  /**
   * GET /api/jobs?page=N — DB에 적재된 공고 N페이지를 등록일순으로 반환한다.
   * 외부 스크래퍼 호출은 일어나지 않으며(요청 경로에서는), 모든 스크래핑은
   * GitHub Actions cron이 별도로 수행해 DB에 채워둔다. Vercel 함수 timeout 안전.
   * page는 양의 정수만 허용한다. 누락·비정규(소수/지수/문자 포함) 값은 1로 보정하고,
   * 상한 MAX_PAGE로 클램프한다. 배열로 들어오면 첫 값을 사용한다.
   */
  @Get()
  async getJobs(@Query('page') page?: string | string[]): Promise<JobsResponse> {
    const rawValue = Array.isArray(page) ? page[0] : page;
    const raw = (rawValue ?? '').trim();
    const parsed = /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
    const pageNum =
      Number.isNaN(parsed) || parsed < 1 ? 1 : Math.min(parsed, MAX_PAGE);
    return this.jobsCron.getJobsFromDb(pageNum);
  }
}
