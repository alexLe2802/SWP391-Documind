import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { waitFor } from '@testing-library/react'
import { LanguageProvider, useLanguage } from './LanguageProvider'

function CurrentLanguage() {
  const { locale, t } = useLanguage()

  return <strong data-locale={locale}>{t('auth.checking')}</strong>
}

describe('LanguageProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.lang = 'vi'
  })

  it('hydrates with the server locale before restoring the saved locale', async () => {
    window.localStorage.setItem('documind-locale', 'en')
    const markup = renderToString(
      <LanguageProvider>
        <CurrentLanguage />
      </LanguageProvider>,
    )
    const container = document.createElement('div')
    container.innerHTML = markup
    document.body.appendChild(container)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const root = hydrateRoot(
      container,
      <LanguageProvider>
        <CurrentLanguage />
      </LanguageProvider>,
    )

    await waitFor(() => {
      expect(container.querySelector('strong')).toHaveAttribute('data-locale', 'en')
      expect(container).toHaveTextContent('Checking your session...')
    })
    expect(
      consoleError.mock.calls.some(([message]) =>
        String(message).includes('Hydration failed'),
      ),
    ).toBe(false)

    act(() => root.unmount())
    container.remove()
  })
})
