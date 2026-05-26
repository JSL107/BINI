import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsCronService } from './jobs-cron.service';
import { ScraperModule } from '../scraper/scraper.module';

@Module({
  imports: [ScraperModule],
  controllers: [JobsController],
  providers: [JobsCronService],
  exports: [JobsCronService],
})
export class JobsModule {}
