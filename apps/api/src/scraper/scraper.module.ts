import { Module } from '@nestjs/common';
import { GamejobScraperService } from './gamejob-scraper.service';
import { GamejobDetailService } from './gamejob-detail.service';
import { WantedScraperService } from './wanted-scraper.service';
import { JobkoreaScraperService } from './jobkorea-scraper.service';

@Module({
  providers: [
    GamejobScraperService,
    GamejobDetailService,
    WantedScraperService,
    JobkoreaScraperService,
  ],
  exports: [
    GamejobScraperService,
    GamejobDetailService,
    WantedScraperService,
    JobkoreaScraperService,
  ],
})
export class ScraperModule {}
