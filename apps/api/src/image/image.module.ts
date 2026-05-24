import { Module } from '@nestjs/common';
import { GameImageService } from './game-image.service';
import { GoogleImageService } from './google-image.service';
import { NamuwikiImageService } from './namuwiki-image.service';

@Module({
  providers: [GameImageService, GoogleImageService, NamuwikiImageService],
  exports: [GameImageService, GoogleImageService, NamuwikiImageService],
})
export class ImageModule {}
