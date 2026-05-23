import { Controller, Get, Query } from '@nestjs/common';
import type { JobImagesResponse } from '@bini/types';
import { JobImagesService } from './job-images.service';

@Controller('job-images')
export class JobImagesController {
  constructor(private readonly service: JobImagesService) {}

  @Get()
  get(@Query('id') id: string): Promise<JobImagesResponse> {
    return this.service.resolve(id);
  }
}
