import { Module } from '@nestjs/common';
import { GamejobScraperService } from './gamejob-scraper.service';

@Module({
  providers: [GamejobScraperService],
  exports: [GamejobScraperService],
})
export class ScraperModule {}
