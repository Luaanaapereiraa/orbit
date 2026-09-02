import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getClaims = vi.fn(async () => ({ data: { claims: { sub: 'user-1' } } }))
const setAllCalls: Array<
  { name: string; value: string; options?: Record<string, unknown> }[]
> = []

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
  ) => {
    return {
      auth: {
        getClaims: async () => {
          options.cookies.setAll([
            {
              name: 'sb-access-token',
              value: 'refreshed',
              options: { path: '/', httpOnly: true },
            },
          ])
          setAllCalls.push([
            {
              name: 'sb-access-token',
              value: 'refreshed',
              options: { path: '/', httpOnly: true },
            },
          ])
          return getClaims()
        },
      },
    }
  },
}))

vi.mock('../public-env', () => ({
  isPublicAuthConfigured: () => true,
  readPublicSupabaseUrl: () => 'https://example.supabase.co',
  readPublicSupabasePublishableKey: () => 'sb_publishable_test',
}))

describe('auth proxy', () => {
  beforeEach(() => {
    getClaims.mockClear()
    setAllCalls.length = 0
  })

  it('calls getClaims and copies cookies to the request and response', async () => {
    const { updateSession } = await import('./proxy')
    const request = new NextRequest('http://localhost/')
    const response = await updateSession(request)

    expect(getClaims).toHaveBeenCalledTimes(1)
    expect(request.cookies.get('sb-access-token')?.value).toBe('refreshed')
    expect(response.cookies.get('sb-access-token')?.value).toBe('refreshed')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('does not match static assets or the service worker', async () => {
    const { shouldHandleAuthProxy } = await import('./proxy')

    expect(shouldHandleAuthProxy('/_next/static/chunk.js')).toBe(false)
    expect(shouldHandleAuthProxy('/_next/image')).toBe(false)
    expect(shouldHandleAuthProxy('/favicon.ico')).toBe(false)
    expect(shouldHandleAuthProxy('/favicon.svg')).toBe(false)
    expect(shouldHandleAuthProxy('/sw.js')).toBe(false)
    expect(shouldHandleAuthProxy('/serwist/sw.js')).toBe(false)
    expect(shouldHandleAuthProxy('/manifest.webmanifest')).toBe(false)
    expect(shouldHandleAuthProxy('/logo.png')).toBe(false)
    expect(shouldHandleAuthProxy('/')).toBe(true)
    expect(shouldHandleAuthProxy('/login')).toBe(true)
    expect(shouldHandleAuthProxy('/auth/callback')).toBe(true)
  })
})
