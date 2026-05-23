import { Module } from '@nestjs/common';
import { GamejobScraperService } from './gamejob-scraper.service';
import { GamejobDetailService } from './gamejob-detail.service';

@Module({
  providers: [GamejobScraperService, GamejobDetailService],
  exports: [GamejobScraperService, GamejobDetailService],
})
export class ScraperModule {}
