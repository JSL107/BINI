import { Controller, Get, Query } from '@nestjs/common';
import type {
  CalendarResponse,
  JobsResponse,
  JobsSort,
  NewSinceResponse,
} from '@bini/types';
import { JobsCronService, type JobsQuery } from './jobs-cron.service';
import {
  parseEmploymentTypeQuery,
  parseExperienceQuery,
  parseLocationQuery,
} from './job-attributes';

/** page 쿼리 상한 — 비정상적으로 큰 값으로 의미 없는 페이지네이션 오프셋을 막기 위한 클램프. */
const MAX_PAGE = 500;
/** GET /jobs/calendar?weeks 허용 범위. 1주 미만 의미 없고 12주 넘으면 그리드가 너무 커진다. */
const CALENDAR_MIN_WEEKS = 1;
const CALENDAR_MAX_WEEKS = 12;
const CALENDAR_DEFAULT_WEEKS = 4;

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsCron: JobsCronService) {}

  /**
   * GET /api/jobs?page=N&q=...&experience=...&employmentType=...&location=...&remote=true&sort=...
   * DB에 적재된 공고 N페이지를 정렬(기본 등록일순)에 따라 반환한다.
   * 외부 스크래퍼 호출은 일어나지 않으며(요청 경로에서는), 모든 스크래핑은
   * GitHub Actions cron이 별도로 수행해 DB에 채워둔다. Vercel 함수 timeout 안전.
   *
   * page는 양의 정수만 허용한다. 누락·비정규(소수/지수/문자 포함) 값은 1로 보정하고,
   * 상한 MAX_PAGE로 클램프한다. 배열로 들어오면 첫 값을 사용한다.
   *
   * experience/employmentType/location은 CSV 또는 반복 쿼리 둘 다 허용.
   * 알려진 값만 통과(unknown은 silently drop). 빈 결과는 필터 미적용으로 해석.
   * remote는 'true'일 때만 isRemote=true 필터링.
   * sort는 'recent'(기본) | 'deadline-soonest'(마감 임박순). 알려지지 않은 값은 recent로 폴백.
   */
  @Get()
  async getJobs(
    @Query('page') page?: string | string[],
    @Query('q') q?: string | string[],
    @Query('experience') experience?: string | string[],
    @Query('employmentType') employmentType?: string | string[],
    @Query('location') location?: string | string[],
    @Query('remote') remote?: string | string[],
    @Query('sort') sort?: string | string[],
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
    const sortValue = Array.isArray(sort) ? sort[0] : sort;
    const opts: JobsQuery = {
      search: search || undefined,
      experience: parseExperienceQuery(experience),
      employmentType: parseEmploymentTypeQuery(employmentType),
      location: parseLocationQuery(location),
      remote: remoteValue === 'true',
      sort: parseSort(sortValue),
    };
    return this.jobsCron.getJobsFromDb(pageNum, undefined, opts);
  }

  /**
   * GET /api/jobs/calendar?weeks=4
   * 오늘(KST) 기준으로 시작하는 N주(기본 4) 캘린더 그리드를 위한 일자별 카운트.
   * - newCount: 그 날 firstSeenAt이 찍힌 잡 수
   * - deadlineCount: 그 날 마감인 잡 수(deadlineAt, expiredAt IS NULL)
   *
   * weeks는 1~12 사이의 정수만 허용. 누락/비정규는 기본 4로.
   */
  @Get('calendar')
  async getCalendar(@Query('weeks') weeks?: string | string[]): Promise<CalendarResponse> {
    const raw = Array.isArray(weeks) ? weeks[0] : weeks;
    const parsed = /^\d+$/.test((raw ?? '').trim()) ? parseInt(raw as string, 10) : NaN;
    const clamped = Number.isNaN(parsed)
      ? CALENDAR_DEFAULT_WEEKS
      : Math.max(CALENDAR_MIN_WEEKS, Math.min(parsed, CALENDAR_MAX_WEEKS));
    return this.jobsCron.getCalendar(clamped);
  }

  /**
   * GET /api/jobs/new-since?since=<ISO>
   * since 시각 이후 BINI가 처음 본(firstSeenAt >= since) primary 잡 수.
   * 홈 헤더의 "지난 방문 이후 신규 N건" 뱃지가 사용한다.
   *
   * since 파싱 실패/누락 시 NEW_SINCE_FALLBACK_DAYS 전을 기본값으로 사용.
   * 미래 시각/너무 먼 과거(>180d)도 동일한 폴백을 적용해 악의적 입력을 컷한다.
   */
  @Get('new-since')
  async getNewSince(
    @Query('since') since?: string | string[],
  ): Promise<NewSinceResponse> {
    const raw = (Array.isArray(since) ? since[0] : since)?.trim() ?? '';
    const ms = raw ? Date.parse(raw) : NaN;
    const now = Date.now();
    const earliest = now - NEW_SINCE_MAX_LOOKBACK_MS;
    const safeMs =
      Number.isNaN(ms) || ms > now || ms < earliest
        ? now - NEW_SINCE_FALLBACK_DAYS * 24 * 60 * 60 * 1000
        : ms;
    const sinceDate = new Date(safeMs);
    const count = await this.jobsCron.getNewSinceCount(sinceDate);
    return { since: sinceDate.toISOString(), count };
  }
}

/** /jobs/new-since 폴백 — since 파라미터 없거나 비정상일 때 기본으로 보는 lookback. */
const NEW_SINCE_FALLBACK_DAYS = 7;
/** since로 받을 수 있는 최대 lookback. 그보다 먼 과거는 폴백 처리(180일). */
const NEW_SINCE_MAX_LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000;

/** sort 쿼리 파라미터 sanitizer. 알려진 값만 통과, 나머지는 undefined(기본=recent). */
function parseSort(raw: string | undefined): JobsSort | undefined {
  if (raw === 'recent' || raw === 'deadline-soonest') return raw;
  return undefined;
}
