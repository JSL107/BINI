import { Module } from '@nestjs/common';
import { GameImageService } from './game-image.service';

@Module({
  providers: [GameImageService],
  exports: [GameImageService],
})
export class ImageModule {}
