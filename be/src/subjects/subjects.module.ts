import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SubjectsController } from './subjects.controller';
import { SubjectsService } from './subjects.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [SubjectsController],
  providers: [SubjectsService],
  exports: [SubjectsService],
})
export class SubjectsModule {}
