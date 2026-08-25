import { Module } from '@nestjs/common';
import { AuthEmailService } from './auth-email.service';
import { MailService } from './mail.service';

@Module({
  providers: [MailService, AuthEmailService],
  exports: [AuthEmailService],
})
export class MailModule {}
