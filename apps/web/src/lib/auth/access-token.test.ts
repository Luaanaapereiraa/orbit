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

  it('clears a session persisted by a stale refresh after logout', async () => {
    const now = 1_700_000_000_000
    let persisted: ReturnType<typeof session> | null = session(
      'old-token',
      now / 1000 - 1,
    )
    let resolveRefresh: (value: ReturnType<typeof session>) => void = () =>
      undefined
    const clearSession = vi.fn(async () => {
      persisted = null
    })
    const reader = createAccessTokenReader({
      getSession: async () => persisted,
      refreshSession: () =>
        new Promise((resolve) => {
          resolveRefresh = resolve
        }),
      clearSession,
      now: () => now,
    })

    const pending = reader.getAccessToken()
    await vi.waitFor(() => {
      expect(resolveRefresh).not.toBeUndefined()
    })
    reader.invalidate()
    const stale = session('fresh-token', now / 1000 + 3600)
    persisted = stale
    resolveRefresh(stale)

    await expect(pending).resolves.toBeNull()
    expect(clearSession).toHaveBeenCalledTimes(1)
    expect(persisted).toBeNull()
  })

  it('does not sign out a newer login when a stale refresh resolves', async () => {
    const now = 1_700_000_000_000
    let persisted: ReturnType<typeof session> | null = session(
      'old-token',
      now / 1000 - 1,
    )
    let resolveRefresh: (value: ReturnType<typeof session>) => void = () =>
      undefined
    const clearSession = vi.fn(async () => {
      persisted = null
    })
    const reader = createAccessTokenReader({
      getSession: async () => persisted,
      refreshSession: () =>
        new Promise((resolve) => {
          resolveRefresh = resolve
        }),
      clearSession,
      now: () => now,
    })

    const pending = reader.getAccessToken()
    reader.invalidate()
    persisted = session('new-login-token', now / 1000 + 3600)
    resolveRefresh(session('stale-fresh-token', now / 1000 + 3600))

    await expect(pending).resolves.toBeNull()
    expect(clearSession).not.toHaveBeenCalled()
    expect(persisted?.accessToken).toBe('new-login-token')
  })

  it('does not let the finally of refresh A clear refresh B', async () => {
    const now = 1_700_000_000_000
    let resolveA: (value: ReturnType<typeof session>) => void = () => undefined
    let resolveB: (value: ReturnType<typeof session>) => void = () => undefined
    const refreshSession = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<ReturnType<typeof session>>((resolve) => {
            resolveA = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<ReturnType<typeof session>>((resolve) => {
            resolveB = resolve
          }),
      )

    const reader = createAccessTokenReader({
      getSession: async () => session('old-token', now / 1000 - 1),
      refreshSession,
      clearSession: async () => undefined,
      now: () => now,
    })

    const fromA = reader.getAccessToken()
    await vi.waitFor(() => {
      expect(refreshSession).toHaveBeenCalledTimes(1)
    })
    reader.invalidate()
    const fromB = reader.getAccessToken()
    await vi.waitFor(() => {
      expect(refreshSession).toHaveBeenCalledTimes(2)
    })

    resolveA(session('token-a', now / 1000 + 3600))
    await expect(fromA).resolves.toBeNull()

    const joinedB = reader.getAccessToken()
    resolveB(session('token-b', now / 1000 + 3600))
    await expect(Promise.all([fromB, joinedB])).resolves.toEqual([
      'token-b',
      'token-b',
    ])
    expect(refreshSession).toHaveBeenCalledTimes(2)
  })

  it('does not refresh when logout happens before refresh starts', async () => {
    const now = 1_700_000_000_000
    let resolveSession: (value: ReturnType<typeof session>) => void = () =>
      undefined
    const refreshSession = vi.fn(async () =>
      session('fresh-token', now / 1000 + 3600),
    )
    const reader = createAccessTokenReader({
      getSession: () =>
        new Promise((resolve) => {
          resolveSession = resolve
        }),
      refreshSession,
      clearSession: async () => undefined,
      now: () => now,
    })

    const pending = reader.getAccessToken()
    reader.invalidate()
    resolveSession(session('old-token', now / 1000 - 1))

    await expect(pending).resolves.toBeNull()
    expect(refreshSession).not.toHaveBeenCalled()
  })

  it('returns null on a later read after logout completed', async () => {
    const now = 1_700_000_000_000
    let persisted: ReturnType<typeof session> | null = session(
      'old-token',
      now / 1000 - 1,
    )
    const reader = createAccessTokenReader({
      getSession: async () => persisted,
      refreshSession: async () => {
        persisted = session('fresh-token', now / 1000 + 3600)
        return persisted
      },
      clearSession: async () => {
        persisted = null
      },
      now: () => now,
    })

    await expect(reader.getAccessToken()).resolves.toBe('fresh-token')
    reader.invalidate()
    persisted = null
    await expect(reader.getAccessToken()).resolves.toBeNull()
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
