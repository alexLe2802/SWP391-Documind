import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  // Xử lý sự kiện module init.
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  // Xử lý sự kiện module destroy.
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
