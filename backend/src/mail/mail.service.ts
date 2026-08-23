import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const RESEND_EMAIL_ENDPOINT = 'https://api.resend.com/emails';
const EMAIL_REQUEST_TIMEOUT_MS = 15_000;

export type SendMailInput = {
  from: string;
  to: string;
  subject: string;
  html: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey?: string;

  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
  }

  // Thực hiện nghiệp vụ send.
  async send(input: SendMailInput): Promise<void> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('Email delivery is not configured');
    }

    try {
      const response = await fetch(RESEND_EMAIL_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'documind/1.0',
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(EMAIL_REQUEST_TIMEOUT_MS),
      });

      if (response.ok) return;

      const responseBody = (await response.text()).slice(0, 1_000);
      this.logger.error(
        `Resend delivery rejected: ${JSON.stringify({
          status: response.status,
          response: responseBody,
        })}`,
      );
      throw new ServiceUnavailableException('Email delivery failed');
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;

      this.logger.error(
        `Resend API request failed: ${JSON.stringify({
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : String(error),
        })}`,
      );
      throw new ServiceUnavailableException('Email delivery failed');
    }
  }
}
