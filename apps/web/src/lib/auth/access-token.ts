export const ACCESS_TOKEN_EXPIRY_MARGIN_SECONDS = 60

export type AccessTokenSession = {
  accessToken: string
  expiresAt: number | null
}

export function createAccessTokenReader(options: {
  getSession: () => Promise<AccessTokenSession | null>
  refreshSession: () => Promise<AccessTokenSession | null>
  clearSession: () => Promise<void>
  now?: () => number
  expiryMarginSeconds?: number
}) {
  let refreshInFlight: Promise<string | null> | null = null
  let generation = 0

  function invalidate() {
    generation += 1
    refreshInFlight = null
  }

  function needsRefresh(session: AccessTokenSession, nowMs: number) {
    if (session.expiresAt === null) {
      return true
    }
    const margin =
      options.expiryMarginSeconds ?? ACCESS_TOKEN_EXPIRY_MARGIN_SECONDS
    return session.expiresAt * 1000 <= nowMs + margin * 1000
  }

  async function getAccessToken() {
    if (refreshInFlight) {
      return refreshInFlight
    }

    const startedGeneration = generation
    refreshInFlight = (async () => {
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
        refreshInFlight = null
      }
    })()

    return refreshInFlight
  }

  return { getAccessToken, invalidate }
}
