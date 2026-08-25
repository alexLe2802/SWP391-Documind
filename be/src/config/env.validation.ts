import Joi from 'joi';

export interface Environment {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DATABASE_URL: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_ENDPOINT: string;
  R2_PRESIGNED_URL_TTL_SECONDS: number;
  R2_PUBLIC_URL?: string;
  GEMINI_API_KEY: string;
  GEMINI_API_KEYS: string;
  GEMINI_MOCK: boolean;
  MOCK_AUTH: boolean;
  GEMINI_MODEL: string;
  GEMINI_FALLBACK_MODELS: string;
  GEMINI_TIMEOUT_MS: number;
  EXTRACTION_TIMEOUT_MS: number;
  EXTRACTION_QUEUE_CONCURRENCY: number;
  EXTRACTION_LEASE_TIMEOUT_MS: number;
  SEPAY_ENABLED: boolean;
  SEPAY_ENV: 'sandbox' | 'production';
  SEPAY_MERCHANT_ID: string;
  SEPAY_SECRET_KEY: string;
  SEPAY_WEBHOOK_API_KEY: string;
  SEPAY_FRONTEND_URL: string;
  SEPAY_STUDENT_PRICE_VND: number;
  SEPAY_PRO_PRICE_VND: number;
  CORS_ORIGIN: string;
  RESEND_API_KEY: string;
  AUTH_EMAIL_FRONTEND_URL: string;
  REGISTRATION_EMAIL_FROM: string;
  RESET_PASSWORD_EMAIL_FROM: string;
  LLAMA_CLOUD_API_KEY?: string;
  LLAMA_PARSE_PREMIUM_MODE: boolean;
  OCR_MAX_PAGES: number;
  SEPAY_BANK_ACCOUNT: string;
  SEPAY_BANK_CODE: string;
  SEPAY_BANK_HOLDER_NAME: string;
}

const environmentSchema = Joi.object<Environment>({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3001),
  DATABASE_URL: Joi.string().required(),
  FIREBASE_PROJECT_ID: Joi.string().required(),
  FIREBASE_CLIENT_EMAIL: Joi.string().email().required(),
  FIREBASE_PRIVATE_KEY: Joi.string().required(),
  R2_ACCOUNT_ID: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.allow('').default(''),
  }),
  R2_ACCESS_KEY_ID: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.allow('').default(''),
  }),
  R2_SECRET_ACCESS_KEY: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.allow('').default(''),
  }),
  R2_BUCKET_NAME: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.allow('').default(''),
  }),
  R2_ENDPOINT: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.allow('').default(''),
    }),
  R2_PRESIGNED_URL_TTL_SECONDS: Joi.number()
    .integer()
    .positive()
    .max(604800)
    .default(300),
  R2_PUBLIC_URL: Joi.string().uri().allow('').optional(),
  GEMINI_API_KEY: Joi.string().trim().allow('').default(''),
  GEMINI_API_KEYS: Joi.string().trim().allow('').default(''),
  GEMINI_MOCK: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.valid(false).default(false),
      otherwise: Joi.boolean().default(true),
    }),
  MOCK_AUTH: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.valid(false).default(false),
      otherwise: Joi.boolean().default(false),
    }),
  GEMINI_MODEL: Joi.string().trim().default('gemini-2.5-flash'),
  GEMINI_FALLBACK_MODELS: Joi.string().allow('').default(''),
  GEMINI_TIMEOUT_MS: Joi.number().integer().positive().default(15000),
  // LlamaParse can poll for up to three minutes, so the enclosing extraction
  // timeout must leave enough room for upload, download, and persistence.
  EXTRACTION_TIMEOUT_MS: Joi.number().integer().positive().default(240000),
  EXTRACTION_QUEUE_CONCURRENCY: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(2),
  EXTRACTION_LEASE_TIMEOUT_MS: Joi.number()
    .integer()
    .min(300000)
    .default(600000),
  SEPAY_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  SEPAY_ENV: Joi.string().valid('sandbox', 'production').default('sandbox'),
  SEPAY_MERCHANT_ID: Joi.string().when('SEPAY_ENABLED', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.allow('').default(''),
  }),
  SEPAY_SECRET_KEY: Joi.string().when('SEPAY_ENABLED', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.allow('').default(''),
  }),
  SEPAY_WEBHOOK_API_KEY: Joi.string().when('SEPAY_ENABLED', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.allow('').default(''),
  }),
  SEPAY_FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),
  SEPAY_STUDENT_PRICE_VND: Joi.number()
    .empty('')
    .integer()
    .positive()
    .default(149000),
  SEPAY_PRO_PRICE_VND: Joi.number()
    .empty('')
    .integer()
    .positive()
    .default(349000),
  CORS_ORIGIN: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default('http://localhost:3000'),
  }),
  RESEND_API_KEY: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.allow('').default(''),
  }),
  AUTH_EMAIL_FRONTEND_URL: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.string().uri().default('http://localhost:3000'),
    }),
  REGISTRATION_EMAIL_FROM: Joi.string()
    .email()
    .default('registration@documind.icu'),
  RESET_PASSWORD_EMAIL_FROM: Joi.string()
    .email()
    .default('reset-password@documind.icu'),
  LLAMA_CLOUD_API_KEY: Joi.string().allow('').optional(),
  LLAMA_PARSE_PREMIUM_MODE: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  OCR_MAX_PAGES: Joi.number().integer().positive().max(50).default(20),
  SEPAY_BANK_ACCOUNT: Joi.string().allow('').default('0123456789'),
  SEPAY_BANK_CODE: Joi.string().allow('').default('MB'),
  SEPAY_BANK_HOLDER_NAME: Joi.string().allow('').default('AI STUDY HUB'),
}).unknown(true);

// Kiểm tra điều kiện environment.
export function validateEnvironment(
  config: Record<string, unknown>,
): Environment {
  const validationResult = environmentSchema.validate(config, {
    abortEarly: false,
    convert: true,
  });

  if (validationResult.error) {
    throw new Error(
      `Environment validation failed: ${validationResult.error.message}`,
    );
  }

  const environment = validationResult.value;
  if (
    !environment.GEMINI_MOCK &&
    !environment.GEMINI_API_KEY.trim() &&
    !environment.GEMINI_API_KEYS.trim()
  ) {
    throw new Error(
      'Environment validation failed: at least one of GEMINI_API_KEY or GEMINI_API_KEYS is required when GEMINI_MOCK=false',
    );
  }

  return environment;
}
