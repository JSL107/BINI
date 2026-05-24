import { Module } from '@nestjs/common';
import { GamejobScraperService } from './gamejob-scraper.service';
import { GamejobDetailService } from './gamejob-detail.service';
import { WantedScraperService } from './wanted-scraper.service';
import { JobkoreaScraperService } from './jobkorea-scraper.service';
import { SaraminScraperService } from './saramin-scraper.service';
import { IncruitScraperService } from './incruit-scraper.service';

@Module({
  providers: [
    GamejobScraperService,
    GamejobDetailService,
    WantedScraperService,
    JobkoreaScraperService,
    SaraminScraperService,
    IncruitScraperService,
  ],
  exports: [
    GamejobScraperService,
    GamejobDetailService,
    WantedScraperService,
    JobkoreaScraperService,
    SaraminScraperService,
    IncruitScraperService,
  ],
})
export class ScraperModule {}
