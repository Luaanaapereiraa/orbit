import { describe, expect, it } from 'vitest'
import { GET } from './route'

describe('auth callback', () => {
  it('rejects a missing code and an open redirect', async () => {
    const response = await GET(
      new Request('http://localhost/auth/callback?next=https://evil.test'),
    )

    expect(response.status).toBeGreaterThanOrEqual(300)
    expect(response.headers.get('location')).toBe(
      'http://localhost/login?error=callback',
    )
  })
})
