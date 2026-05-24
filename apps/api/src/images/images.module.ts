import { Module } from '@nestjs/common';
import { BadImageController } from './bad-image.controller';
import { BadImageService } from './bad-image.service';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { JobImagesController } from './job-images.controller';
import { JobImagesService } from './job-images.service';
import { ImageModule } from '../image/image.module';
import { ScraperModule } from '../scraper/scraper.module';

@Module({
  imports: [ImageModule, ScraperModule],
  controllers: [ImagesController, JobImagesController, BadImageController],
  providers: [ImagesService, JobImagesService, BadImageService],
  exports: [BadImageService],
})
export class ImagesModule {}
