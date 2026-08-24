const mockCert = jest.fn<unknown, [unknown]>();
const mockGetApps = jest.fn<unknown[], []>();
const mockInitializeApp = jest.fn<unknown, [unknown]>();
const mockGetAuth = jest.fn<unknown, [unknown]>();

jest.mock('firebase-admin/app', () => ({
  cert: (...args: [unknown]) => mockCert(...args),
  getApps: () => mockGetApps(),
  initializeApp: (...args: [unknown]) => mockInitializeApp(...args),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: (...args: [unknown]) => mockGetAuth(...args),
}));

import { firebaseAuthProvider } from './firebase-admin.providers';

describe('firebase-admin.providers', () => {
  const configService = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        FIREBASE_PROJECT_ID: 'mock-project',
        FIREBASE_CLIENT_EMAIL: 'mock@example.com',
        FIREBASE_PRIVATE_KEY:
          '-----BEGIN PRIVATE KEY-----\\nMOCK\\n-----END PRIVATE KEY-----\\n',
      };

      return values[key];
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'development';
  });

  it('falls back to non-credential initialization when cert parsing fails in development', () => {
    mockGetApps.mockReturnValue([]);
    mockCert.mockImplementation(() => {
      throw new Error('invalid key');
    });
    mockInitializeApp.mockReturnValue({ id: 'fallback-app' });
    mockGetAuth.mockReturnValue({ kind: 'auth' });

    const auth = (
      firebaseAuthProvider as { useFactory: (config: never) => unknown }
    ).useFactory(configService as never);

    expect(mockCert).toHaveBeenCalledTimes(1);
    expect(mockInitializeApp).toHaveBeenCalledWith({
      projectId: 'mock-project',
    });
    expect(mockGetAuth).toHaveBeenCalledWith({ id: 'fallback-app' });
    expect(auth).toEqual({ kind: 'auth' });
  });
});
