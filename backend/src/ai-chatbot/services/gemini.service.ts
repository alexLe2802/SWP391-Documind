import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getNextMockResponse } from '../mocks/mock-ai-response';

export interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export type GeminiErrorCode =
  | 'GEMINI_MISSING_API_KEY'
  | 'GEMINI_NETWORK_ERROR'
  | 'GEMINI_TIMEOUT'
  | 'GEMINI_RATE_LIMIT'
  | 'GEMINI_INVALID_RESPONSE'
  | 'GEMINI_API_ERROR'
  | 'GEMINI_UNKNOWN_ERROR';

export interface GeminiSafeResponse {
  success: boolean;
  answer: string;
  errorCode: GeminiErrorCode | null;
  errorMessage: string | null;
  isMock: boolean;
  finishReason?: string | null;
  truncated?: boolean;
}

export interface GeminiReplyOptions {
  timeoutMs?: number;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

@Injectable()
export class GeminiService {
  private readonly defaultModel = 'gemini-2.5-flash';
  private readonly defaultTimeoutMs = 15_000;
  private readonly defaultMaxOutputTokens = 4096;
  private readonly endpointBase =
    'https://generativelanguage.googleapis.com/v1beta/models';
  private readonly logger = new Logger(GeminiService.name);
  private preferredApiKeyIndex = 0;
  private readonly quotaCooldownMs = 60_000;
  private readonly quotaCooldownUntil = new Map<string, number>();

  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly configService: ConfigService) {}

  // Xử lý embedding.
  async generateEmbedding(text: string): Promise<number[]> {
    if (this.getApiKeys().length === 0) {
      throw new Error('Gemini API key is not configured.');
    }

    return this.withApiKeyFailover((apiKey) =>
      this.invokeEmbedding(text, apiKey),
    );
  }

  // Thực hiện chức năng invoke embedding.
  private async invokeEmbedding(
    text: string,
    apiKey: string,
  ): Promise<number[]> {
    const model = 'gemini-embedding-001';
    const url = `${this.endpointBase}/${model}:embedContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        content: {
          parts: [{ text }],
        },
        // Must match the vector(768) column on document_chunks.
        outputDimensionality: 768,
      }),
    });

    if (!response.ok) {
      throw new GeminiServiceError(
        response.status === 429 ? 'GEMINI_RATE_LIMIT' : 'GEMINI_API_ERROR',
        `Gemini Embedding API returned HTTP ${response.status}.`,
      );
    }

    const result = (await response.json()) as {
      embedding?: {
        values?: number[];
      };
    };

    const embedding = result.embedding?.values;
    if (!embedding) {
      throw new Error('No embedding returned from Gemini');
    }

    return embedding;
  }

  // Xử lý reply.
  async generateReply(
    contents: GeminiContent[],
    systemInstruction: string,
    options?: GeminiReplyOptions,
  ): Promise<GeminiSafeResponse> {
    if (this.isMockMode()) {
      this.logger.debug('[MOCK] Returning a canned Gemini response');
      return this.success(getNextMockResponse(), true);
    }

    if (this.getApiKeys().length === 0) {
      this.logger.warn('Gemini API key is missing while mock mode is disabled');
      return this.failure(
        'GEMINI_MISSING_API_KEY',
        'Gemini API key is not configured.',
      );
    }

    try {
      const response = await this.withModelFailover((model) =>
        this.withApiKeyFailover((apiKey) =>
          this.invokeGemini(
            contents,
            systemInstruction,
            apiKey,
            model,
            options,
          ),
        ),
      );
      return this.success(response.answer, false, response.finishReason);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Thực hiện chức năng invoke gemini.
  private async invokeGemini(
    contents: GeminiContent[],
    systemInstruction: string,
    apiKey: string,
    model: string,
    options?: GeminiReplyOptions,
  ): Promise<GeminiGenerateContentResponse> {
    const controller = new AbortController();

    try {
      const response = await this.fetchWithTimeout(
        this.buildUrl(model),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: this.getMaxOutputTokens(),
            },
          }),
          signal: controller.signal,
        },
        controller,
        options,
      );

      if (!response.ok) {
        throw new GeminiServiceError(
          response.status === 429 ? 'GEMINI_RATE_LIMIT' : 'GEMINI_API_ERROR',
          this.toHttpErrorMessage(response.status),
        );
      }

      return (await response.json()) as GeminiGenerateContentResponse;
    } catch (error) {
      if (this.isAbortError(error)) {
        throw new GeminiServiceError(
          'GEMINI_TIMEOUT',
          'Gemini request timed out.',
        );
      }

      throw error;
    }
  }

  // Lấy dữ liệu with timeout.
  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    controller: AbortController,
    options?: GeminiReplyOptions,
  ): Promise<Response> {
    let timeout: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        fetch(url, init),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(
              new GeminiServiceError(
                'GEMINI_TIMEOUT',
                'Gemini request timed out.',
              ),
            );
          }, this.getTimeoutMs(options));
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  // Thực hiện chức năng with model failover.
  private async withModelFailover(
    operation: (model: string) => Promise<GeminiGenerateContentResponse>,
  ): Promise<{ answer: string; finishReason: string | null }> {
    const models = this.getModels();
    let lastError: unknown;

    for (let index = 0; index < models.length; index += 1) {
      try {
        const response = await operation(models[index]);
        const answer = this.extractAnswer(response);
        if (!answer) {
          throw new GeminiServiceError(
            'GEMINI_INVALID_RESPONSE',
            'Gemini returned an empty response.',
          );
        }

        return {
          answer,
          finishReason: response.candidates?.[0]?.finishReason ?? null,
        };
      } catch (error) {
        lastError = error;
        if (!this.canTryFallbackModel(error) || index === models.length - 1) {
          throw error;
        }
        this.logger.warn(
          `Gemini model ${models[index]} failed; trying fallback model ${models[index + 1]}.`,
        );
      }
    }

    throw lastError;
  }

  // Kiểm tra điều kiện try fallback model.
  private canTryFallbackModel(error: unknown): boolean {
    if (error instanceof GeminiServiceError) {
      return [
        'GEMINI_API_ERROR',
        'GEMINI_TIMEOUT',
        'GEMINI_INVALID_RESPONSE',
      ].includes(error.code);
    }

    return this.isNetworkError(error);
  }

  // Chuyển đổi hoặc chuẩn hóa url.
  private buildUrl(modelName: string): string {
    const model = encodeURIComponent(modelName);
    return `${this.endpointBase}/${model}:generateContent`;
  }

  // Xử lý answer.
  private extractAnswer(
    response: GeminiGenerateContentResponse | null,
  ): string {
    if (!response || typeof response !== 'object') {
      return '';
    }

    return (
      response.candidates?.[0]?.content?.parts
        ?.map((part) => part.text?.trim() ?? '')
        .filter(Boolean)
        .join('\n')
        .trim() ?? ''
    );
  }

  // Kiểm tra điều kiện mock mode.
  private isMockMode(): boolean {
    return this.configService.get<boolean>('GEMINI_MOCK') ?? false;
  }

  // Lấy dữ liệu model.
  private getModel(): string {
    return this.getStringConfig('GEMINI_MODEL') || this.defaultModel;
  }

  // Lấy dữ liệu models.
  private getModels(): string[] {
    return [
      this.getModel(),
      ...this.getStringConfig('GEMINI_FALLBACK_MODELS').split(','),
    ]
      .map((model) => model.trim())
      .filter(Boolean)
      .filter((model, index, models) => models.indexOf(model) === index);
  }

  // Lấy dữ liệu timeout ms.
  private getTimeoutMs(options?: GeminiReplyOptions): number {
    if (
      typeof options?.timeoutMs === 'number' &&
      Number.isInteger(options.timeoutMs) &&
      options.timeoutMs > 0
    ) {
      return options.timeoutMs;
    }

    const timeout = this.configService.get<number>('GEMINI_TIMEOUT_MS');
    if (
      typeof timeout === 'number' &&
      Number.isInteger(timeout) &&
      timeout > 0
    ) {
      return timeout;
    }

    return this.defaultTimeoutMs;
  }

  // Lấy dữ liệu max output tokens.
  private getMaxOutputTokens(): number {
    const configured = this.configService.get<string | number>(
      'GEMINI_MAX_OUTPUT_TOKENS',
    );
    const parsed =
      typeof configured === 'number' ? configured : Number(configured);
    return Number.isInteger(parsed) && parsed > 0
      ? parsed
      : this.defaultMaxOutputTokens;
  }

  // Lấy dữ liệu string config.
  private getStringConfig(key: string): string {
    return this.configService.get<string>(key)?.trim() ?? '';
  }

  // Lấy dữ liệu api keys.
  private getApiKeys(): string[] {
    const keys = [
      this.getStringConfig('GEMINI_API_KEY'),
      ...this.getStringConfig('GEMINI_API_KEYS').split(','),
    ]
      .map((key) => key.trim())
      .filter(Boolean);

    return [...new Set(keys)];
  }

  // Thực hiện chức năng with api key failover.
  private async withApiKeyFailover<T>(
    operation: (apiKey: string) => Promise<T>,
  ): Promise<T> {
    const keys = this.getApiKeys();
    const now = Date.now();
    const availableIndices = keys
      .map((key, index) => ({ key, index }))
      .filter(({ key }) => (this.quotaCooldownUntil.get(key) ?? 0) <= now)
      .map(({ index }) => index);

    if (availableIndices.length === 0) {
      throw new GeminiServiceError(
        'GEMINI_RATE_LIMIT',
        'All configured Gemini keys are temporarily rate-limited.',
      );
    }

    let lastError: unknown;

    for (let offset = 0; offset < availableIndices.length; offset += 1) {
      const index =
        availableIndices.find(
          (candidate) =>
            candidate === (this.preferredApiKeyIndex + offset) % keys.length,
        ) ?? availableIndices[offset];
      try {
        const result = await operation(keys[index]);
        this.preferredApiKeyIndex = index;
        return result;
      } catch (error) {
        lastError = error;
        if (
          error instanceof GeminiServiceError &&
          error.code === 'GEMINI_RATE_LIMIT'
        ) {
          this.quotaCooldownUntil.set(
            keys[index],
            Date.now() + this.quotaCooldownMs,
          );
        }
        if (
          !(error instanceof GeminiServiceError) ||
          error.code !== 'GEMINI_RATE_LIMIT' ||
          offset === availableIndices.length - 1
        ) {
          throw error;
        }
        this.logger.warn(
          `Gemini quota exhausted for configured key #${index + 1}; trying the next key.`,
        );
      }
    }

    throw lastError;
  }

  // Xử lý sự kiện lỗi.
  private handleError(error: unknown): GeminiSafeResponse {
    if (error instanceof GeminiServiceError) {
      this.logger.warn(error.message);
      return this.failure(error.code, error.message);
    }

    if (this.isNetworkError(error)) {
      this.logger.warn('Gemini network error');
      return this.failure(
        'GEMINI_NETWORK_ERROR',
        'Gemini request failed due to a network error.',
      );
    }

    this.logger.error('Gemini request failed unexpectedly');
    return this.failure(
      'GEMINI_UNKNOWN_ERROR',
      'Gemini request failed unexpectedly.',
    );
  }

  // Kiểm tra điều kiện network lỗi.
  private isNetworkError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const maybeError = error as { code?: unknown; name?: unknown };
    return (
      typeof maybeError.code === 'string' || maybeError.name === 'TypeError'
    );
  }

  // Kiểm tra điều kiện abort lỗi.
  private isAbortError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { name?: unknown }).name === 'AbortError'
    );
  }

  // Chuyển đổi hoặc chuẩn hóa http lỗi tin nhắn.
  private toHttpErrorMessage(status: number): string {
    if (status === 429) {
      return 'Gemini rate limit or quota exceeded.';
    }

    return `Gemini API returned HTTP ${status}.`;
  }

  // Thực hiện chức năng success.
  private success(
    answer: string,
    isMock: boolean,
    finishReason?: string | null,
  ): GeminiSafeResponse {
    const completion = finishReason
      ? {
          finishReason,
          truncated: finishReason === 'MAX_TOKENS',
        }
      : {};
    return {
      success: true,
      answer,
      errorCode: null,
      errorMessage: null,
      isMock,
      ...completion,
    };
  }

  // Thực hiện chức năng failure.
  private failure(
    errorCode: GeminiErrorCode,
    errorMessage: string,
  ): GeminiSafeResponse {
    return {
      success: false,
      answer:
        'Xin lỗi, hiện tại AI chưa thể tạo câu trả lời. Vui lòng thử lại sau.',
      errorCode,
      errorMessage,
      isMock: false,
    };
  }
}

export class GeminiServiceError extends Error {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(
    readonly code: GeminiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = GeminiServiceError.name;
  }
}
