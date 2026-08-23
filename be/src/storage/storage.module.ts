import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageController } from './storage.controller';
import { r2PresignerProvider, r2S3ClientProvider } from './storage.providers';
import { StorageService } from './storage.service';

@Module({
  imports: [AuthModule],
  controllers: [StorageController],
  providers: [r2S3ClientProvider, r2PresignerProvider, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
