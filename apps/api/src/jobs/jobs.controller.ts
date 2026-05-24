import { Controller, Get, Query } from '@nestjs/common';
import type { JobsResponse } from '@bini/types';
import { JobsCronService, type JobsQuery } from './jobs-cron.service';
import {
  parseEmploymentTypeQuery,
  parseExperienceQuery,
  parseLocationQuery,
} from './job-attributes';

/** page 쿼리 상한 — 비정상적으로 큰 값으로 의미 없는 페이지네이션 오프셋을 막기 위한 클램프. */
const MAX_PAGE = 500;

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsCron: JobsCronService) {}

  /**
   * GET /api/jobs?page=N&q=...&experience=...&employmentType=...&location=...&remote=true
   * DB에 적재된 공고 N페이지를 등록일순으로 반환한다.
   * 외부 스크래퍼 호출은 일어나지 않으며(요청 경로에서는), 모든 스크래핑은
   * GitHub Actions cron이 별도로 수행해 DB에 채워둔다. Vercel 함수 timeout 안전.
   *
   * page는 양의 정수만 허용한다. 누락·비정규(소수/지수/문자 포함) 값은 1로 보정하고,
   * 상한 MAX_PAGE로 클램프한다. 배열로 들어오면 첫 값을 사용한다.
   *
   * experience/employmentType/location은 CSV 또는 반복 쿼리 둘 다 허용.
   * 알려진 값만 통과(unknown은 silently drop). 빈 결과는 필터 미적용으로 해석.
   * remote는 'true'일 때만 isRemote=true 필터링.
   */
  @Get()
  async getJobs(
    @Query('page') page?: string | string[],
    @Query('q') q?: string | string[],
    @Query('experience') experience?: string | string[],
    @Query('employmentType') employmentType?: string | string[],
    @Query('location') location?: string | string[],
    @Query('remote') remote?: string | string[],
  ): Promise<JobsResponse> {
    const rawValue = Array.isArray(page) ? page[0] : page;
    const raw = (rawValue ?? '').trim();
    const parsed = /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
    const pageNum =
      Number.isNaN(parsed) || parsed < 1 ? 1 : Math.min(parsed, MAX_PAGE);
    // 검색어: 첫 값만 사용 + 200자 클램프(악의적으로 큰 LIKE 패턴 방지)
    const qValue = Array.isArray(q) ? q[0] : q;
    const search = (qValue ?? '').trim().slice(0, 200);
    const remoteValue = Array.isArray(remote) ? remote[0] : remote;
    const opts: JobsQuery = {
      search: search || undefined,
      experience: parseExperienceQuery(experience),
      employmentType: parseEmploymentTypeQuery(employmentType),
      location: parseLocationQuery(location),
      remote: remoteValue === 'true',
    };
    return this.jobsCron.getJobsFromDb(pageNum, undefined, opts);
  }
}
