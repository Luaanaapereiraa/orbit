import { describe, expect, it, vi } from 'vitest'
import { createAccessTokenReader } from './access-token'

function session(token: string, expiresAt: number | null) {
  return { accessToken: token, expiresAt }
}

describe('createAccessTokenReader', () => {
  it('returns a valid token without refreshing', async () => {
    const now = 1_700_000_000_000
    const reader = createAccessTokenReader({
      getSession: async () => session('valid-token', now / 1000 + 3600),
      refreshSession: async () => {
        throw new Error('should not refresh')
      },
      clearSession: async () => undefined,
      now: () => now,
    })

    await expect(reader.getAccessToken()).resolves.toBe('valid-token')
  })

  it('refreshes an expired token', async () => {
    const now = 1_700_000_000_000
    const refreshSession = vi.fn(async () =>
      session('fresh-token', now / 1000 + 3600),
    )
    const reader = createAccessTokenReader({
      getSession: async () => session('old-token', now / 1000 - 10),
      refreshSession,
      clearSession: async () => undefined,
      now: () => now,
    })

    await expect(reader.getAccessToken()).resolves.toBe('fresh-token')
    expect(refreshSession).toHaveBeenCalledTimes(1)
  })

  it('refreshes a token close to expiry', async () => {
    const now = 1_700_000_000_000
    const refreshSession = vi.fn(async () =>
      session('fresh-token', now / 1000 + 3600),
    )
    const reader = createAccessTokenReader({
      getSession: async () => session('old-token', now / 1000 + 30),
      refreshSession,
      clearSession: async () => undefined,
      now: () => now,
    })

    await expect(reader.getAccessToken()).resolves.toBe('fresh-token')
    expect(refreshSession).toHaveBeenCalledTimes(1)
  })

  it('deduplicates concurrent refresh', async () => {
    const now = 1_700_000_000_000
    let resolveRefresh: (value: ReturnType<typeof session>) => void = () =>
      undefined
    const refreshSession = vi.fn(
      () =>
        new Promise<ReturnType<typeof session>>((resolve) => {
          resolveRefresh = resolve
        }),
    )
    const reader = createAccessTokenReader({
      getSession: async () => session('old-token', now / 1000 - 1),
      refreshSession,
      clearSession: async () => undefined,
      now: () => now,
    })

    const first = reader.getAccessToken()
    const second = reader.getAccessToken()
    await vi.waitFor(() => {
      expect(refreshSession).toHaveBeenCalledTimes(1)
    })
    resolveRefresh(session('fresh-token', now / 1000 + 3600))

    await expect(Promise.all([first, second])).resolves.toEqual([
      'fresh-token',
      'fresh-token',
    ])
    expect(refreshSession).toHaveBeenCalledTimes(1)
  })

  it('clears the session when refresh fails', async () => {
    const now = 1_700_000_000_000
    const clearSession = vi.fn(async () => undefined)
    const reader = createAccessTokenReader({
      getSession: async () => session('old-token', now / 1000 - 1),
      refreshSession: async () => {
        throw new Error('invalid refresh')
      },
      clearSession,
      now: () => now,
    })

    await expect(reader.getAccessToken()).resolves.toBeNull()
    expect(clearSession).toHaveBeenCalledTimes(1)
  })

  it('returns null when logout happens during refresh', async () => {
    const now = 1_700_000_000_000
    let resolveRefresh: (value: ReturnType<typeof session>) => void = () =>
      undefined
    const clearSession = vi.fn(async () => undefined)
    const reader = createAccessTokenReader({
      getSession: async () => session('old-token', now / 1000 - 1),
      refreshSession: () =>
        new Promise((resolve) => {
          resolveRefresh = resolve
        }),
      clearSession,
      now: () => now,
    })

    const pending = reader.getAccessToken()
    reader.invalidate()
    resolveRefresh(session('fresh-token', now / 1000 + 3600))

    await expect(pending).resolves.toBeNull()
    expect(clearSession).not.toHaveBeenCalled()
  })

  it('returns null when there is no session', async () => {
    const reader = createAccessTokenReader({
      getSession: async () => null,
      refreshSession: async () => session('fresh', 9_999_999_999),
      clearSession: async () => undefined,
    })

    await expect(reader.getAccessToken()).resolves.toBeNull()
  })
})
