import { Module } from '@nestjs/common';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { ImageModule } from '../image/image.module';

@Module({
  imports: [ImageModule],
  controllers: [ImagesController],
  providers: [ImagesService],
})
export class ImagesModule {}
