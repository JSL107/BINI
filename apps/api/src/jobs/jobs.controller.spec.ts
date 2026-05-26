import { JobsController } from './jobs.controller';
import { JobsCronService } from './jobs-cron.service';

describe('JobsController', () => {
  function build(getJobsFromDbImpl?: (p: number) => Promise<unknown>) {
    const getJobsFromDb = getJobsFromDbImpl
      ? jest.fn(getJobsFromDbImpl)
      : jest.fn().mockResolvedValue({ page: 1, totalPages: 5, jobs: [] });
    const service = { getJobsFromDb } as unknown as JobsCronService;
    return { controller: new JobsController(service), getJobsFromDb };
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
});
