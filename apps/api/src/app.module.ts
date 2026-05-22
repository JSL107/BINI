import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { JobsModule } from './jobs/jobs.module';
import { ImagesModule } from './images/images.module';

@Module({
  imports: [PrismaModule, JobsModule, ImagesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
