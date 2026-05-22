import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

describe('JobsController', () => {
  function build() {
    const getJobsPage = jest.fn().mockResolvedValue({
      page: 2, totalPages: 5, jobs: [],
    });
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

  it('잘못된 page 값은 1로 보정한다', async () => {
    const { controller, getJobsPage } = build();
    await controller.getJobs('abc');
    expect(getJobsPage).toHaveBeenCalledWith(1);
  });

  it('음수/0 page 값도 1로 보정한다', async () => {
    const { controller, getJobsPage } = build();
    await controller.getJobs('0');
    await controller.getJobs('-3');
    expect(getJobsPage).toHaveBeenNthCalledWith(1, 1);
    expect(getJobsPage).toHaveBeenNthCalledWith(2, 1);
  });
});
