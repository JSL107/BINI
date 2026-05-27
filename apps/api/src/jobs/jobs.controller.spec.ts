import { JobsController } from './jobs.controller';
import { JobsCronService } from './jobs-cron.service';

describe('JobsController', () => {
  function build(getJobsFromDbImpl?: (p: number) => Promise<unknown>) {
    const getJobsFromDb = getJobsFromDbImpl
      ? jest.fn(getJobsFromDbImpl)
      : jest.fn().mockResolvedValue({ page: 1, totalPages: 5, jobs: [] });
    const getCalendar = jest
      .fn()
      .mockResolvedValue({ startDate: '2026-05-27', endDate: '2026-06-23', days: [] });
    const getNewSinceCount = jest.fn().mockResolvedValue(0);
    const service = {
      getJobsFromDb,
      getCalendar,
      getNewSinceCount,
    } as unknown as JobsCronService;
    return {
      controller: new JobsController(service),
      getJobsFromDb,
      getCalendar,
      getNewSinceCount,
    };
  }

  // 신규 시그니처: (page, undefined, opts) — opts는 search/experience/employmentType/location/remote/sort.
  const emptyOpts = {
    search: undefined,
    experience: [],
    employmentType: [],
    location: [],
    remote: false,
    sort: undefined,
  };

  it('page 쿼리를 정수로 서비스에 전달한다', async () => {
    const { controller, getJobsFromDb } = build();
    await controller.getJobs('2');
    expect(getJobsFromDb).toHaveBeenCalledWith(2, undefined, emptyOpts);
  });

  it('page 미지정 시 1페이지를 조회한다', async () => {
    const { controller, getJobsFromDb } = build();
    await controller.getJobs(undefined);
    expect(getJobsFromDb).toHaveBeenCalledWith(1, undefined, emptyOpts);
  });

  it('비정규 page 값(abc, 2abc, 1.9, 2e3)은 1로 보정한다', async () => {
    const { controller, getJobsFromDb } = build();
    for (const v of ['abc', '2abc', '1.9', '2e3']) {
      await controller.getJobs(v);
    }
    expect(getJobsFromDb).toHaveBeenNthCalledWith(1, 1, undefined, emptyOpts);
    expect(getJobsFromDb).toHaveBeenNthCalledWith(2, 1, undefined, emptyOpts);
    expect(getJobsFromDb).toHaveBeenNthCalledWith(3, 1, undefined, emptyOpts);
    expect(getJobsFromDb).toHaveBeenNthCalledWith(4, 1, undefined, emptyOpts);
  });

  it('음수/0 page 값도 1로 보정한다', async () => {
    const { controller, getJobsFromDb } = build();
    await controller.getJobs('0');
    await controller.getJobs('-3');
    expect(getJobsFromDb).toHaveBeenNthCalledWith(1, 1, undefined, emptyOpts);
    expect(getJobsFromDb).toHaveBeenNthCalledWith(2, 1, undefined, emptyOpts);
  });

  it('상한(500)을 넘는 page는 500으로 클램프한다', async () => {
    const { controller, getJobsFromDb } = build();
    await controller.getJobs('999999');
    expect(getJobsFromDb).toHaveBeenCalledWith(500, undefined, emptyOpts);
  });

  it('배열로 들어온 page는 첫 값을 쓴다', async () => {
    const { controller, getJobsFromDb } = build();
    await controller.getJobs(['3', '7']);
    expect(getJobsFromDb).toHaveBeenCalledWith(3, undefined, emptyOpts);
  });

  it('서비스가 던진 예외를 그대로 전파한다', async () => {
    const { controller } = build(() => Promise.reject(new Error('db down')));
    await expect(controller.getJobs('1')).rejects.toThrow('db down');
  });

  it('experience CSV에서 알려진 값만 통과', async () => {
    const { controller, getJobsFromDb } = build();
    await controller.getJobs('1', undefined, 'newcomer,bogus,senior');
    expect(getJobsFromDb).toHaveBeenCalledWith(1, undefined, {
      ...emptyOpts,
      experience: ['newcomer', 'senior'],
    });
  });

  it('employmentType 단일 값 전달', async () => {
    const { controller, getJobsFromDb } = build();
    await controller.getJobs('1', undefined, undefined, 'fulltime');
    expect(getJobsFromDb).toHaveBeenCalledWith(1, undefined, {
      ...emptyOpts,
      employmentType: ['fulltime'],
    });
  });

  it('location 다중 + 알려진 시도만 통과', async () => {
    const { controller, getJobsFromDb } = build();
    await controller.getJobs('1', undefined, undefined, undefined, '서울,도쿄,경기');
    expect(getJobsFromDb).toHaveBeenCalledWith(1, undefined, {
      ...emptyOpts,
      location: ['서울', '경기'],
    });
  });

  it("remote='true'만 true로", async () => {
    const { controller, getJobsFromDb } = build();
    await controller.getJobs('1', undefined, undefined, undefined, undefined, 'true');
    expect(getJobsFromDb).toHaveBeenCalledWith(1, undefined, {
      ...emptyOpts,
      remote: true,
    });
  });

  it("remote가 'true' 외 값이면 false로 본다", async () => {
    const { controller, getJobsFromDb } = build();
    await controller.getJobs('1', undefined, undefined, undefined, undefined, '1');
    expect(getJobsFromDb).toHaveBeenCalledWith(1, undefined, emptyOpts);
  });

  it('q 검색어는 200자로 클램프', async () => {
    const { controller, getJobsFromDb } = build();
    const long = 'a'.repeat(500);
    await controller.getJobs('1', long);
    const call = getJobsFromDb.mock.calls[0];
    const opts = call[2] as { search?: string };
    expect(opts.search?.length).toBe(200);
  });

  it("sort='deadline-soonest'를 그대로 전달", async () => {
    const { controller, getJobsFromDb } = build();
    await controller.getJobs(
      '1',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'deadline-soonest',
    );
    expect(getJobsFromDb).toHaveBeenCalledWith(1, undefined, {
      ...emptyOpts,
      sort: 'deadline-soonest',
    });
  });

  it("sort='recent'는 명시 전달", async () => {
    const { controller, getJobsFromDb } = build();
    await controller.getJobs(
      '1',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'recent',
    );
    expect(getJobsFromDb).toHaveBeenCalledWith(1, undefined, {
      ...emptyOpts,
      sort: 'recent',
    });
  });

  it('알 수 없는 sort 값은 undefined로 폴백', async () => {
    const { controller, getJobsFromDb } = build();
    await controller.getJobs(
      '1',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'random-sort',
    );
    expect(getJobsFromDb).toHaveBeenCalledWith(1, undefined, emptyOpts);
  });

  it('sort 배열로 들어오면 첫 값만 사용', async () => {
    const { controller, getJobsFromDb } = build();
    await controller.getJobs(
      '1',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ['deadline-soonest', 'recent'],
    );
    expect(getJobsFromDb).toHaveBeenCalledWith(1, undefined, {
      ...emptyOpts,
      sort: 'deadline-soonest',
    });
  });

  describe('GET /jobs/calendar', () => {
    it('weeks 미지정 시 기본 4주', async () => {
      const { controller, getCalendar } = build();
      await controller.getCalendar(undefined);
      expect(getCalendar).toHaveBeenCalledWith(4);
    });

    it('weeks 양의 정수는 통과', async () => {
      const { controller, getCalendar } = build();
      await controller.getCalendar('6');
      expect(getCalendar).toHaveBeenCalledWith(6);
    });

    it('weeks 비정규(abc, 1.5)는 기본 4주로 폴백', async () => {
      const { controller, getCalendar } = build();
      await controller.getCalendar('abc');
      await controller.getCalendar('1.5');
      expect(getCalendar).toHaveBeenNthCalledWith(1, 4);
      expect(getCalendar).toHaveBeenNthCalledWith(2, 4);
    });

    it('weeks 상한(12) 초과는 12로 클램프', async () => {
      const { controller, getCalendar } = build();
      await controller.getCalendar('999');
      expect(getCalendar).toHaveBeenCalledWith(12);
    });

    it('weeks 0 또는 음수는 최소 1로 클램프', async () => {
      const { controller, getCalendar } = build();
      // 음수는 /^\d+$/에 안 걸려 NaN → 기본 4. 0은 정수라 통과 후 1로 clamp.
      await controller.getCalendar('0');
      expect(getCalendar).toHaveBeenCalledWith(1);
    });

    it('weeks 배열은 첫 값만 사용', async () => {
      const { controller, getCalendar } = build();
      await controller.getCalendar(['2', '8']);
      expect(getCalendar).toHaveBeenCalledWith(2);
    });
  });

  describe('GET /jobs/new-since', () => {
    it('정상 ISO since는 그대로 service에 전달', async () => {
      const { controller, getNewSinceCount } = build();
      const since = '2026-05-26T12:00:00.000Z';
      const res = await controller.getNewSince(since);
      expect(getNewSinceCount).toHaveBeenCalledTimes(1);
      const arg = getNewSinceCount.mock.calls[0][0] as Date;
      expect(arg.toISOString()).toBe(since);
      expect(res.since).toBe(since);
    });

    it('since 누락 시 7일 전을 기본값으로', async () => {
      const { controller, getNewSinceCount } = build();
      const before = Date.now();
      await controller.getNewSince(undefined);
      const arg = getNewSinceCount.mock.calls[0][0] as Date;
      const diffMs = before - arg.getTime();
      // 약 7일 = 604_800_000ms. 호출 오버헤드 1초 미만 허용.
      expect(diffMs).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000 - 1000);
      expect(diffMs).toBeLessThan(7 * 24 * 60 * 60 * 1000 + 1000);
    });

    it('parse 실패 since(=garbage)는 7일 전 폴백', async () => {
      const { controller, getNewSinceCount } = build();
      const before = Date.now();
      await controller.getNewSince('not-a-date');
      const arg = getNewSinceCount.mock.calls[0][0] as Date;
      const diffMs = before - arg.getTime();
      expect(diffMs).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000 - 1000);
    });

    it('미래 시각은 폴백 (악의적 입력 방어)', async () => {
      const { controller, getNewSinceCount } = build();
      const future = new Date(Date.now() + 60_000).toISOString();
      const before = Date.now();
      await controller.getNewSince(future);
      const arg = getNewSinceCount.mock.calls[0][0] as Date;
      const diffMs = before - arg.getTime();
      expect(diffMs).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000 - 1000);
    });

    it('너무 먼 과거(180일+)는 폴백', async () => {
      const { controller, getNewSinceCount } = build();
      const old = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      const before = Date.now();
      await controller.getNewSince(old);
      const arg = getNewSinceCount.mock.calls[0][0] as Date;
      const diffMs = before - arg.getTime();
      expect(diffMs).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000 - 1000);
      expect(diffMs).toBeLessThan(7 * 24 * 60 * 60 * 1000 + 1000);
    });

    it('count를 그대로 반환', async () => {
      const { controller, getNewSinceCount } = build();
      getNewSinceCount.mockResolvedValueOnce(42);
      const res = await controller.getNewSince('2026-05-26T12:00:00.000Z');
      expect(res.count).toBe(42);
    });

    it('since 배열은 첫 값만 사용', async () => {
      const { controller, getNewSinceCount } = build();
      const a = '2026-05-26T12:00:00.000Z';
      const b = '2026-05-27T12:00:00.000Z';
      await controller.getNewSince([a, b]);
      const arg = getNewSinceCount.mock.calls[0][0] as Date;
      expect(arg.toISOString()).toBe(a);
    });
  });
});
