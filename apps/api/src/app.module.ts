import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { JobsModule } from './jobs/jobs.module';
import { ImagesModule } from './images/images.module';
import { CompaniesModule } from './companies/companies.module';
import { StatsModule } from './stats/stats.module';

@Module({
  imports: [PrismaModule, JobsModule, ImagesModule, CompaniesModule, StatsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
