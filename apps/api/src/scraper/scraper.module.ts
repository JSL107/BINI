import { Module } from '@nestjs/common';
import { GamejobScraperService } from './gamejob-scraper.service';
import { GamejobDetailService } from './gamejob-detail.service';
import { WantedScraperService } from './wanted-scraper.service';

@Module({
  providers: [GamejobScraperService, GamejobDetailService, WantedScraperService],
  exports: [GamejobScraperService, GamejobDetailService, WantedScraperService],
})
export class ScraperModule {}
