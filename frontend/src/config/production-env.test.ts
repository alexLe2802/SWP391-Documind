import { describe, expect, it } from 'vitest'
import { validateProductionEnvironment } from './production-env'

describe('validateProductionEnvironment', () => {
  const validEnvironment = {
    NODE_ENV: 'production',
    NEXT_PUBLIC_API_BASE_URL: 'https://api.documind.icu/api',
    NEXT_PUBLIC_FIREBASE_API_KEY: 'firebase-key',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'documind.firebaseapp.com',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'documind',
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'documind.appspot.com',
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123456789',
    NEXT_PUBLIC_FIREBASE_APP_ID: '1:123456789:web:abcdef',
  }

  it('accepts a complete production environment', () => {
    expect(() => validateProductionEnvironment(validEnvironment)).not.toThrow()
  })

  it('rejects frontend mock APIs in production', () => {
    expect(() =>
      validateProductionEnvironment({
        ...validEnvironment,
        NEXT_PUBLIC_USE_MOCK_API: 'true',
      }),
    ).toThrow('NEXT_PUBLIC_USE_MOCK_API must not be true in production')
  })

  it('reports every missing production variable at once', () => {
    expect(() => validateProductionEnvironment({ NODE_ENV: 'production' })).toThrow(
      'Missing production environment variables: NEXT_PUBLIC_API_BASE_URL, NEXT_PUBLIC_FIREBASE_API_KEY',
    )
  })

  it('does not require production credentials in development', () => {
    expect(() => validateProductionEnvironment({ NODE_ENV: 'development' })).not.toThrow()
  })
})
