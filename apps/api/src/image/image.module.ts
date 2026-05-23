import { Module } from '@nestjs/common';
import { GameImageService } from './game-image.service';
import { GoogleImageService } from './google-image.service';
import { GoogleCrawlerImageService } from './google-crawler.service';

@Module({
  providers: [GameImageService, GoogleImageService, GoogleCrawlerImageService],
  exports: [GameImageService, GoogleImageService, GoogleCrawlerImageService],
})
export class ImageModule {}
