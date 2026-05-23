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

  it('page 쿼리를 정수로 서비스에 전달한다', async () => {
    const { controller, getJobsFromDb } = build();
    await controller.getJobs('2');
    expect(getJobsFromDb).toHaveBeenCalledWith(2);
  });

  it('page 미지정 시 1페이지를 조회한다', async () => {
    const { controller, getJobsFromDb } = build();
    await controller.getJobs(undefined);
    expect(getJobsFromDb).toHaveBeenCalledWith(1);
  });

  it('비정규 page 값(abc, 2abc, 1.9, 2e3)은 1로 보정한다', async () => {
    const { controller, getJobsFromDb } = build();
    for (const v of ['abc', '2abc', '1.9', '2e3']) {
      await controller.getJobs(v);
    }
    expect(getJobsFromDb).toHaveBeenNthCalledWith(1, 1);
    expect(getJobsFromDb).toHaveBeenNthCalledWith(2, 1);
    expect(getJobsFromDb).toHaveBeenNthCalledWith(3, 1);
    expect(getJobsFromDb).toHaveBeenNthCalledWith(4, 1);
  });

  it('음수/0 page 값도 1로 보정한다', async () => {
    const { controller, getJobsFromDb } = build();
    await controller.getJobs('0');
    await controller.getJobs('-3');
    expect(getJobsFromDb).toHaveBeenNthCalledWith(1, 1);
    expect(getJobsFromDb).toHaveBeenNthCalledWith(2, 1);
  });

  it('상한(500)을 넘는 page는 500으로 클램프한다', async () => {
    const { controller, getJobsFromDb } = build();
    await controller.getJobs('999999');
    expect(getJobsFromDb).toHaveBeenCalledWith(500);
  });

  it('배열로 들어온 page는 첫 값을 쓴다', async () => {
    const { controller, getJobsFromDb } = build();
    await controller.getJobs(['3', '7']);
    expect(getJobsFromDb).toHaveBeenCalledWith(3);
  });

  it('서비스가 던진 예외를 그대로 전파한다', async () => {
    const { controller } = build(() => Promise.reject(new Error('db down')));
    await expect(controller.getJobs('1')).rejects.toThrow('db down');
  });
});
