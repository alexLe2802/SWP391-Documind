import {
  clearStoredAuthToken,
  notifyUnauthorized,
} from './auth-token'

describe('auth token storage', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  it('removes legacy Firebase ID token copies from web storage', () => {
    window.sessionStorage.setItem(
      'ai-study-hub.firebaseIdToken',
      'session-token',
    )
    window.localStorage.setItem('ai-study-hub.firebaseIdToken', 'local-token')

    clearStoredAuthToken()

    expect(
      window.sessionStorage.getItem('ai-study-hub.firebaseIdToken'),
    ).toBeNull()
    expect(
      window.localStorage.getItem('ai-study-hub.firebaseIdToken'),
    ).toBeNull()
  })

  it('notifies the auth provider when authentication is invalid', () => {
    const listener = vi.fn()
    window.addEventListener('ai-study-hub:unauthorized', listener)

    notifyUnauthorized()

    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener('ai-study-hub:unauthorized', listener)
  })
})
