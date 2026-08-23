import { vi } from 'vitest'

describe('Firebase configuration', () => {
  it('does not require an explicit storage bucket environment variable', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'test-api-key')
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com')
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'test-project')
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', '')
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', '123456')
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_APP_ID', 'test-app-id')

    const { getFirebaseApp } = await import('./firebase')

    expect(() => getFirebaseApp()).not.toThrow()
    expect(getFirebaseApp().options.storageBucket).toBe(
      'test-project.firebasestorage.app',
    )

    vi.unstubAllEnvs()
  })
})
