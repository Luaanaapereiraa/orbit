export const ACCESS_TOKEN_EXPIRY_MARGIN_SECONDS = 60

export type AccessTokenSession = {
  accessToken: string
  expiresAt: number | null
}

type RefreshEntry = {
  generation: number
  promise: Promise<string | null>
}

export function createAccessTokenReader(options: {
  getSession: () => Promise<AccessTokenSession | null>
  refreshSession: () => Promise<AccessTokenSession | null>
  clearSession: () => Promise<void>
  now?: () => number
  expiryMarginSeconds?: number
}) {
  let refreshInFlight: RefreshEntry | null = null
  let generation = 0

  function invalidate() {
    generation += 1
  }

  function needsRefresh(session: AccessTokenSession, nowMs: number) {
    if (session.expiresAt === null) {
      return true
    }
    const margin =
      options.expiryMarginSeconds ?? ACCESS_TOKEN_EXPIRY_MARGIN_SECONDS
    return session.expiresAt * 1000 <= nowMs + margin * 1000
  }

  async function discardStaleRefresh(refreshed: AccessTokenSession | null) {
    if (!refreshed?.accessToken) {
      return
    }

    const current = await options.getSession()
    if (current?.accessToken === refreshed.accessToken) {
      await options.clearSession()
    }
  }

  async function getAccessToken() {
    if (refreshInFlight && refreshInFlight.generation === generation) {
      return refreshInFlight.promise
    }

    const startedGeneration = generation
    const entry: RefreshEntry = {
      generation: startedGeneration,
      promise: Promise.resolve(null),
    }

    entry.promise = (async () => {
      try {
        const session = await options.getSession()
        if (generation !== startedGeneration) {
          return null
        }
        if (!session?.accessToken) {
          return null
        }

        const nowMs = options.now?.() ?? Date.now()
        if (!needsRefresh(session, nowMs)) {
          return session.accessToken
        }

        const refreshed = await options.refreshSession()
        if (generation !== startedGeneration) {
          await discardStaleRefresh(refreshed)
          return null
        }
        if (!refreshed?.accessToken) {
          await options.clearSession()
          return null
        }
        return refreshed.accessToken
      } catch {
        if (generation !== startedGeneration) {
          return null
        }
        await options.clearSession()
        return null
      } finally {
        if (refreshInFlight === entry) {
          refreshInFlight = null
        }
      }
    })()

    refreshInFlight = entry
    return entry.promise
  }

  return { getAccessToken, invalidate }
}
