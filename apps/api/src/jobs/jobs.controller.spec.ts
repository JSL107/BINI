import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

describe('JobsController', () => {
  function build(getJobsPageImpl?: (p: number) => Promise<unknown>) {
    const getJobsPage = getJobsPageImpl
      ? jest.fn(getJobsPageImpl)
      : jest.fn().mockResolvedValue({ page: 1, totalPages: 5, jobs: [] });
    const service = { getJobsPage } as unknown as JobsService;
    return { controller: new JobsController(service), getJobsPage };
  }

  it('page 쿼리를 정수로 서비스에 전달한다', async () => {
    const { controller, getJobsPage } = build();
    await controller.getJobs('2');
    expect(getJobsPage).toHaveBeenCalledWith(2);
  });

  it('page 미지정 시 1페이지를 조회한다', async () => {
    const { controller, getJobsPage } = build();
    await controller.getJobs(undefined);
    expect(getJobsPage).toHaveBeenCalledWith(1);
  });

  it('비정규 page 값(abc, 2abc, 1.9, 2e3)은 1로 보정한다', async () => {
    const { controller, getJobsPage } = build();
    for (const v of ['abc', '2abc', '1.9', '2e3']) {
      await controller.getJobs(v);
    }
    expect(getJobsPage).toHaveBeenNthCalledWith(1, 1);
    expect(getJobsPage).toHaveBeenNthCalledWith(2, 1);
    expect(getJobsPage).toHaveBeenNthCalledWith(3, 1);
    expect(getJobsPage).toHaveBeenNthCalledWith(4, 1);
  });

  it('음수/0 page 값도 1로 보정한다', async () => {
    const { controller, getJobsPage } = build();
    await controller.getJobs('0');
    await controller.getJobs('-3');
    expect(getJobsPage).toHaveBeenNthCalledWith(1, 1);
    expect(getJobsPage).toHaveBeenNthCalledWith(2, 1);
  });

  it('상한(500)을 넘는 page는 500으로 클램프한다', async () => {
    const { controller, getJobsPage } = build();
    await controller.getJobs('999999');
    expect(getJobsPage).toHaveBeenCalledWith(500);
  });

  it('배열로 들어온 page는 첫 값을 쓴다', async () => {
    const { controller, getJobsPage } = build();
    await controller.getJobs(['3', '7']);
    expect(getJobsPage).toHaveBeenCalledWith(3);
  });

  it('서비스가 던진 예외를 그대로 전파한다', async () => {
    const { controller } = build(() => Promise.reject(new Error('502 upstream')));
    await expect(controller.getJobs('1')).rejects.toThrow('502 upstream');
  });
});
