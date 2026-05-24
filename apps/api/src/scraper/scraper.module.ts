import { Module } from '@nestjs/common';
import { GamejobScraperService } from './gamejob-scraper.service';
import { GamejobDetailService } from './gamejob-detail.service';
import { WantedScraperService } from './wanted-scraper.service';
import { WantedDetailService } from './wanted-detail.service';
import { JobkoreaScraperService } from './jobkorea-scraper.service';
import { JobkoreaDetailService } from './jobkorea-detail.service';
import { SaraminScraperService } from './saramin-scraper.service';
import { IncruitScraperService } from './incruit-scraper.service';
import { IncruitDetailService } from './incruit-detail.service';

@Module({
  providers: [
    GamejobScraperService,
    GamejobDetailService,
    WantedScraperService,
    WantedDetailService,
    JobkoreaScraperService,
    JobkoreaDetailService,
    SaraminScraperService,
    IncruitScraperService,
    IncruitDetailService,
  ],
  exports: [
    GamejobScraperService,
    GamejobDetailService,
    WantedScraperService,
    WantedDetailService,
    JobkoreaScraperService,
    JobkoreaDetailService,
    SaraminScraperService,
    IncruitScraperService,
    IncruitDetailService,
  ],
})
export class ScraperModule {}
