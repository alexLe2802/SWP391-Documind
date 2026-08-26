import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  const fetchSpy = jest.spyOn(global, 'fetch');
  const service = new MailService(
    new ConfigService({ RESEND_API_KEY: 're_test_secret' }),
  );
  const message = {
    from: 'registration@documind.icu',
    to: 'student@example.com',
    subject: 'Verify account',
    html: '<p>Verify</p>',
  };

  beforeEach(() => jest.clearAllMocks());

  afterAll(() => fetchSpy.mockRestore());

  it('sends email through the Resend HTTPS API', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ id: 'email-id' }), { status: 200 }),
    );

    await service.send(message);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, request] = fetchSpy.mock.calls[0];
    const headers = new Headers(request?.headers);
    expect(url).toBe('https://api.resend.com/emails');
    expect(request?.method).toBe('POST');
    expect(headers.get('Authorization')).toBe('Bearer re_test_secret');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('User-Agent')).toBe('documind/1.0');
    expect(request?.body).toBe(JSON.stringify(message));
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns a service error when Resend rejects the email', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: 'recipient details' }), {
        status: 403,
      }),
    );

    await expect(service.send(message)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns a service error when the Resend request fails', async () => {
    fetchSpy.mockRejectedValue(new Error('network details'));

    await expect(service.send(message)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects delivery when no Resend key is configured', async () => {
    const unconfiguredService = new MailService(new ConfigService({}));

    await expect(unconfiguredService.send(message)).rejects.toThrow(
      'Email delivery is not configured',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
