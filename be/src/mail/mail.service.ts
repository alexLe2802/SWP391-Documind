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

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
  }

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

      // Do not log the response body: providers may echo recipient or content.
      this.logger.error(
        `Resend delivery rejected: ${JSON.stringify({ status: response.status })}`,
      );
      throw new ServiceUnavailableException('Email delivery failed');
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;

      // Do not log the API key, message, recipient, or generated action URL.
      this.logger.error(
        `Resend API request failed: ${JSON.stringify({
          errorName: error instanceof Error ? error.name : 'UnknownError',
        })}`,
      );
      throw new ServiceUnavailableException('Email delivery failed');
    }
  }
}
