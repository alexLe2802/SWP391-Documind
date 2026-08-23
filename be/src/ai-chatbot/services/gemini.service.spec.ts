import { ConfigService } from '@nestjs/config';
import { GeminiContent, GeminiService } from './gemini.service';

describe('GeminiService', () => {
  const contents: GeminiContent[] = [
    { role: 'user', parts: [{ text: 'What is this document about?' }] },
  ];
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function createService(config: Record<string, unknown>): GeminiService {
    return new GeminiService(new ConfigService(config));
  }

  it('returns a successful mock response in mock mode without an API key', async () => {
    const service = createService({ GEMINI_MOCK: true });

    await expect(service.generateReply(contents, 'system')).resolves.toEqual(
      expect.objectContaining({
        success: true,
        errorCode: null,
        errorMessage: null,
        isMock: true,
      }),
    );
  });

  it('returns a safe error when mock mode is disabled and API key is missing', async () => {
    const service = createService({
      GEMINI_MOCK: false,
      GEMINI_API_KEY: '',
    });

    await expect(service.generateReply(contents, 'system')).resolves.toEqual(
      expect.objectContaining({
        success: false,
        answer:
          'Xin lỗi, hiện tại AI chưa thể tạo câu trả lời. Vui lòng thử lại sau.',
        errorCode: 'GEMINI_MISSING_API_KEY',
        isMock: false,
      }),
    );
  });

  it('returns a timeout safe response', async () => {
    global.fetch = jest.fn(() => new Promise<Response>(() => undefined));
    const service = createService({
      GEMINI_MOCK: false,
      GEMINI_API_KEY: 'test-key',
      GEMINI_TIMEOUT_MS: 1,
    });

    await expect(service.generateReply(contents, 'system')).resolves.toEqual(
      expect.objectContaining({
        success: false,
        errorCode: 'GEMINI_TIMEOUT',
        isMock: false,
      }),
    );
  });

  it('maps rate limit responses to a safe response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: jest.fn().mockResolvedValue('quota exceeded'),
    });
    const service = createService({
      GEMINI_MOCK: false,
      GEMINI_API_KEY: 'test-key',
    });

    await expect(service.generateReply(contents, 'system')).resolves.toEqual(
      expect.objectContaining({
        success: false,
        errorCode: 'GEMINI_RATE_LIMIT',
      }),
    );
  });

  it('maps Gemini 5xx responses to a safe API error without leaking provider body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: jest
        .fn()
        .mockResolvedValue('upstream stack trace with internal details'),
    });
    const service = createService({
      GEMINI_MOCK: false,
      GEMINI_API_KEY: 'test-key',
    });

    const result = await service.generateReply(contents, 'system');

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        errorCode: 'GEMINI_API_ERROR',
        errorMessage: 'Gemini API returned HTTP 503.',
        isMock: false,
      }),
    );
    expect(JSON.stringify(result)).not.toContain('upstream stack trace');
  });

  it('uses the next configured key after a quota response', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: jest.fn().mockResolvedValue('quota exceeded'),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          candidates: [{ content: { parts: [{ text: 'Fallback answer' }] } }],
        }),
      });
    global.fetch = fetchMock;
    const service = createService({
      GEMINI_MOCK: false,
      GEMINI_API_KEY: 'primary-key',
      GEMINI_API_KEYS: 'backup-key',
    });

    await expect(
      service.generateReply(contents, 'system'),
    ).resolves.toMatchObject({
      success: true,
      answer: 'Fallback answer',
    });
    const calls = fetchMock.mock.calls as Array<
      [RequestInfo | URL, RequestInit | undefined]
    >;
    const primaryInit = calls[0][1] as RequestInit;
    const backupInit = calls[1][1] as RequestInit;
    expect(primaryInit.headers).toMatchObject({
      'x-goog-api-key': 'primary-key',
    });
    expect(backupInit.headers).toMatchObject({
      'x-goog-api-key': 'backup-key',
    });
  });

  it('uses a fallback model when the primary model returns a retryable API error', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: jest.fn().mockResolvedValue('service unavailable'),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          candidates: [
            { content: { parts: [{ text: 'Fallback model answer' }] } },
          ],
        }),
      });
    global.fetch = fetchMock;
    const service = createService({
      GEMINI_MOCK: false,
      GEMINI_API_KEY: 'test-key',
      GEMINI_MODEL: 'primary-model',
      GEMINI_FALLBACK_MODELS: 'fallback-model',
    });

    await expect(
      service.generateReply(contents, 'system'),
    ).resolves.toMatchObject({
      success: true,
      answer: 'Fallback model answer',
      errorCode: null,
    });
    const calls = fetchMock.mock.calls as Array<
      [RequestInfo | URL, RequestInit | undefined]
    >;
    expect(calls[0][0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/primary-model:generateContent',
    );
    expect(calls[1][0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/fallback-model:generateContent',
    );
  });

  it('maps network errors to a safe response', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('network'), { code: 'ECONNRESET' }),
      );
    const service = createService({
      GEMINI_MOCK: false,
      GEMINI_API_KEY: 'test-key',
    });

    await expect(service.generateReply(contents, 'system')).resolves.toEqual(
      expect.objectContaining({
        success: false,
        errorCode: 'GEMINI_NETWORK_ERROR',
      }),
    );
  });

  it('rejects empty Gemini responses with a safe response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: '   ' }] } }],
      }),
    });
    const service = createService({
      GEMINI_MOCK: false,
      GEMINI_API_KEY: 'test-key',
    });

    await expect(service.generateReply(contents, 'system')).resolves.toEqual(
      expect.objectContaining({
        success: false,
        errorCode: 'GEMINI_INVALID_RESPONSE',
      }),
    );
  });

  it('rejects null Gemini responses as invalid response data', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(null),
    });
    const service = createService({
      GEMINI_MOCK: false,
      GEMINI_API_KEY: 'test-key',
    });

    await expect(service.generateReply(contents, 'system')).resolves.toEqual(
      expect.objectContaining({
        success: false,
        errorCode: 'GEMINI_INVALID_RESPONSE',
        isMock: false,
      }),
    );
  });

  it('calls the Gemini REST API and wraps successful responses', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                { text: ' Generated answer ' },
                { text: '\nwith detail' },
              ],
            },
          },
        ],
      }),
    });
    global.fetch = fetchMock;
    const service = createService({
      GEMINI_MOCK: false,
      GEMINI_API_KEY: 'test-key',
      GEMINI_MODEL: 'gemini-2.5-flash',
    });

    await expect(service.generateReply(contents, 'system')).resolves.toEqual({
      success: true,
      answer: 'Generated answer\nwith detail',
      errorCode: null,
      errorMessage: null,
      isMock: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': 'test-key',
        },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: 'system' }] },
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
          },
        }),
      }),
    );
  });

  it('uses a configured output-token limit', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Answer' }] } }],
      }),
    });
    global.fetch = fetchMock;
    const service = createService({
      GEMINI_MOCK: false,
      GEMINI_API_KEY: 'test-key',
      GEMINI_MAX_OUTPUT_TOKENS: 6000,
    });

    await service.generateReply(contents, 'system');

    const calls = fetchMock.mock.calls as Array<
      [RequestInfo | URL, RequestInit | undefined]
    >;
    const body = JSON.parse((calls[0][1] as RequestInit).body as string) as {
      generationConfig: { maxOutputTokens: number };
    };
    expect(body.generationConfig.maxOutputTokens).toBe(6000);
  });

  it('marks a successful response as truncated when Gemini reaches MAX_TOKENS', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        candidates: [
          {
            finishReason: 'MAX_TOKENS',
            content: { parts: [{ text: 'Partial answer because' }] },
          },
        ],
      }),
    });
    const service = createService({
      GEMINI_MOCK: false,
      GEMINI_API_KEY: 'test-key',
    });

    await expect(
      service.generateReply(contents, 'system'),
    ).resolves.toMatchObject({
      success: true,
      answer: 'Partial answer because',
      finishReason: 'MAX_TOKENS',
      truncated: true,
    });
  });
});
