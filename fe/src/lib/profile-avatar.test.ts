import { AVATAR_MAX_SIZE, validateAvatarFile } from './profile-avatar'

describe('profile avatar validation', () => {
  it('accepts supported image files within the size limit', () => {
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' })

    expect(validateAvatarFile(file)).toBeNull()
  })

  it('rejects unsupported file types', () => {
    const file = new File(['not-an-image'], 'avatar.pdf', {
      type: 'application/pdf',
    })

    expect(validateAvatarFile(file)).toBe('type')
  })

  it('rejects images larger than 5 MB', () => {
    const file = new File(
      [new Uint8Array(AVATAR_MAX_SIZE + 1)],
      'large-avatar.jpg',
      { type: 'image/jpeg' },
    )

    expect(validateAvatarFile(file)).toBe('size')
  })
})
