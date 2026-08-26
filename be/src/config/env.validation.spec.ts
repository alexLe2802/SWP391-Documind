import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  const validEnvironment = {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/ai_study_hub',
    FIREBASE_PROJECT_ID: 'project-id',
    FIREBASE_CLIENT_EMAIL: 'firebase@example.com',
    FIREBASE_PRIVATE_KEY: 'private-key',
    GEMINI_API_KEY: 'gemini-key',
  };

  const validProductionEnvironment = {
    ...validEnvironment,
    NODE_ENV: 'production',
    GEMINI_MOCK: false,
    MOCK_AUTH: false,
    R2_ACCOUNT_ID: 'account-id',
    R2_ACCESS_KEY_ID: 'access-key',
    R2_SECRET_ACCESS_KEY: 'secret-key',
    R2_BUCKET_NAME: 'bucket',
    R2_ENDPOINT: 'https://account-id.r2.cloudflarestorage.com',
    CORS_ORIGIN: 'https://documind.icu',
    RESEND_API_KEY: 'resend-key',
    AUTH_EMAIL_FRONTEND_URL: 'https://documind.icu',
  };

  it('applies development defaults', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3001,
      R2_PRESIGNED_URL_TTL_SECONDS: 300,
      GEMINI_MOCK: true,
      GEMINI_API_KEYS: '',
      GEMINI_MODEL: 'gemini-2.5-flash',
      GEMINI_FALLBACK_MODELS: '',
      GEMINI_TIMEOUT_MS: 15000,
      EXTRACTION_TIMEOUT_MS: 240000,
      LLAMA_PARSE_PREMIUM_MODE: false,
      OCR_MAX_PAGES: 20,
      CORS_ORIGIN: 'http://localhost:3000',
      SEPAY_FRONTEND_URL: 'http://localhost:3000',
      SEPAY_ENABLED: false,
      SEPAY_ENV: 'sandbox',
      SEPAY_STUDENT_PRICE_VND: 149000,
      SEPAY_PRO_PRICE_VND: 349000,
      SEPAY_BANK_ACCOUNT: '0123456789',
      SEPAY_BANK_CODE: 'MB',
      SEPAY_BANK_HOLDER_NAME: 'AI STUDY HUB',
    });
  });

  it('rejects a missing database URL', () => {
    const { DATABASE_URL: _databaseUrl, ...environment } = validEnvironment;

    expect(() => validateEnvironment(environment)).toThrow(
      '"DATABASE_URL" is required',
    );
  });

  it('requires R2 credentials and a bucket in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
      }),
    ).toThrow(
      '"R2_ACCOUNT_ID" is required. "R2_ACCESS_KEY_ID" is required. "R2_SECRET_ACCESS_KEY" is required. "R2_BUCKET_NAME" is required. "R2_ENDPOINT" is required',
    );
  });

  it('treats blank optional SePay prices as unset and applies defaults', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        SEPAY_STUDENT_PRICE_VND: '',
        SEPAY_PRO_PRICE_VND: '',
      }),
    ).toMatchObject({
      SEPAY_STUDENT_PRICE_VND: 149000,
      SEPAY_PRO_PRICE_VND: 349000,
    });
  });

  it('disables mock modes by default in production', () => {
    const result = validateEnvironment({
      ...validProductionEnvironment,
      GEMINI_MOCK: undefined,
      MOCK_AUTH: undefined,
    });

    expect(result).toMatchObject({
      GEMINI_MOCK: false,
      MOCK_AUTH: false,
    });
  });

  it('rejects Gemini mock mode in production', () => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        GEMINI_MOCK: true,
      }),
    ).toThrow('"GEMINI_MOCK" must be [false]');
  });

  it('rejects mock authentication in production', () => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        MOCK_AUTH: true,
      }),
    ).toThrow('"MOCK_AUTH" must be [false]');
  });

  it('requires a Resend API key in production', () => {
    const { RESEND_API_KEY: _resendApiKey, ...environment } =
      validProductionEnvironment;

    expect(() => validateEnvironment(environment)).toThrow(
      '"RESEND_API_KEY" is required',
    );
  });

  it('requires a Gemini API key when mock mode is disabled', () => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        GEMINI_API_KEY: '',
        GEMINI_API_KEYS: '',
      }),
    ).toThrow(
      'at least one of GEMINI_API_KEY or GEMINI_API_KEYS is required when GEMINI_MOCK=false',
    );
  });

  it('allows an empty R2 public URL for private buckets', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        R2_PUBLIC_URL: '',
      }),
    ).toMatchObject({
      R2_PUBLIC_URL: '',
    });
  });

  it('rejects a presigned URL TTL longer than seven days', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        R2_PRESIGNED_URL_TTL_SECONDS: 604801,
      }),
    ).toThrow(
      '"R2_PRESIGNED_URL_TTL_SECONDS" must be less than or equal to 604800',
    );
  });

  it('rejects a non-positive Gemini timeout', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        GEMINI_TIMEOUT_MS: 0,
      }),
    ).toThrow('"GEMINI_TIMEOUT_MS" must be a positive number');
  });

  it('rejects a non-positive extraction timeout', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        EXTRACTION_TIMEOUT_MS: 0,
      }),
    ).toThrow('"EXTRACTION_TIMEOUT_MS" must be a positive number');
  });

  it('requires a webhook API key when SePay is enabled', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        SEPAY_ENABLED: true,
        SEPAY_MERCHANT_ID: 'merchant-id',
        SEPAY_SECRET_KEY: 'secret-key',
      }),
    ).toThrow('"SEPAY_WEBHOOK_API_KEY" is required');
  });
});
