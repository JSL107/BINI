import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JobsCronService } from './jobs-cron.service';
import { ScraperModule } from '../scraper/scraper.module';

@Module({
  imports: [ScraperModule],
  controllers: [JobsController],
  providers: [JobsService, JobsCronService],
  exports: [JobsCronService],
})
export class JobsModule {}
