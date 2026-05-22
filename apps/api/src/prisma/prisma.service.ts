import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const adapter = new PrismaPg({
      connectionString:
        process.env.DATABASE_URL ??
        'postgresql://postgres:bini@localhost:5433/bini',
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
