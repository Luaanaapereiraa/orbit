import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const exchangeCodeForSession = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: {
      cookies: {
        getAll: () => { name: string; value: string }[]
        setAll: (
          cookies: {
            name: string
            value: string
            options?: Record<string, unknown>
          }[],
        ) => void
      }
    },
  ) => ({
    auth: {
      exchangeCodeForSession: async (code: string) => {
        const result = await exchangeCodeForSession(code)
        if (!result.error) {
          options.cookies.setAll([
            {
              name: 'sb-access-token',
              value: 'session-cookie',
              options: { path: '/', httpOnly: true, secure: true },
            },
          ])
        }
        return result
      },
    },
  }),
}))

vi.mock('../../../lib/public-env', () => ({
  isPublicAuthConfigured: () => true,
  readPublicSupabaseUrl: () => 'https://example.supabase.co',
  readPublicSupabasePublishableKey: () => 'sb_publishable_test',
}))

describe('auth callback', () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset()
  })

  it('rejects a missing code and an open redirect', async () => {
    const { GET } = await import('./route')
    const response = await GET(
      new NextRequest('http://localhost/auth/callback?next=https://evil.test'),
    )

    expect(response.status).toBeGreaterThanOrEqual(300)
    expect(response.headers.get('location')).toBe(
      'http://localhost/login?error=callback',
    )
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('writes cookies on the returned redirect for a valid code', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null })
    const { GET } = await import('./route')
    const response = await GET(
      new NextRequest('http://localhost/auth/callback?code=valid-code'),
    )

    expect(response.status).toBeGreaterThanOrEqual(300)
    expect(response.headers.get('location')).toBe('http://localhost/')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.cookies.get('sb-access-token')?.value).toBe(
      'session-cookie',
    )
    expect(response.headers.get('location')).not.toContain('valid-code')
    expect(exchangeCodeForSession).toHaveBeenCalledWith('valid-code')
  })

  it('sends a recovery code to the password reset screen', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null })
    const { GET } = await import('./route')
    const response = await GET(
      new NextRequest(
        'http://localhost/auth/callback?code=recovery-code&type=recovery',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'http://localhost/login?reset=1',
    )
    expect(response.cookies.get('sb-access-token')?.value).toBe(
      'session-cookie',
    )
    expect(exchangeCodeForSession).toHaveBeenCalledWith('recovery-code')
  })

  it('returns a safe error for an invalid code', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: 'invalid' } })
    const { GET } = await import('./route')
    const response = await GET(
      new NextRequest('http://localhost/auth/callback?code=bad-code'),
    )

    expect(response.headers.get('location')).toBe(
      'http://localhost/login?error=callback',
    )
    expect(response.cookies.get('sb-access-token')).toBeUndefined()
  })
})
