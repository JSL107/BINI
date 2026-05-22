import { Controller, Get, Query } from '@nestjs/common';
import type { JobsResponse } from '@bini/types';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  getJobs(@Query('page') page?: string): Promise<JobsResponse> {
    const parsed = parseInt(page ?? '1', 10);
    const pageNum = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
    return this.jobsService.getJobsPage(pageNum);
  }
}
