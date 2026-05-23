import { Module } from '@nestjs/common';
import { GameImageService } from './game-image.service';
import { GoogleImageService } from './google-image.service';

@Module({
  providers: [GameImageService, GoogleImageService],
  exports: [GameImageService, GoogleImageService],
})
export class ImageModule {}
