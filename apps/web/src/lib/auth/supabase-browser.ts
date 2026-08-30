import type {
  Session as SupabaseSession,
  SupabaseClient,
} from '@supabase/supabase-js'
import { createSupabaseBrowserClient as createBrowserSupabase } from '../supabase/client'
import { isPublicAuthConfigured } from '../public-env'
import { createAccessTokenReader } from './access-token'
import type { AuthClient, Session } from './types'

function sessionFrom(session: SupabaseSession | null): Session | null {
  if (!session?.access_token || !session.user?.id) {
    return null
  }

  return {
    accessToken: session.access_token,
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
    },
  }
}

function tokenSessionFrom(session: SupabaseSession | null) {
  if (!session?.access_token) {
    return null
  }
  return {
    accessToken: session.access_token,
    expiresAt: session.expires_at ?? null,
  }
}

export function createSupabaseBrowserClient(): AuthClient | null {
  if (!isPublicAuthConfigured()) {
    return null
  }

  const client = createBrowserSupabase() as SupabaseClient
  const tokenReader = createAccessTokenReader({
    async getSession() {
      const { data, error } = await client.auth.getSession()
      if (error) {
        return null
      }
      return tokenSessionFrom(data.session)
    },
    async refreshSession() {
      const { data, error } = await client.auth.refreshSession()
      if (error) {
        return null
      }
      return tokenSessionFrom(data.session)
    },
    async clearSession() {
      await client.auth.signOut()
    },
  })

  return {
    async getSession() {
      const { data, error } = await client.auth.getSession()
      if (error) {
        throw new Error('Não foi possível ler a sessão.')
      }
      return sessionFrom(data.session)
    },
    async signInWithEmail(email) {
      const redirectTo =
        typeof window === 'undefined'
          ? undefined
          : `${window.location.origin}/auth/callback`
      const { error } = await client.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true,
        },
      })
      if (error) {
        throw new Error('Não foi possível enviar o link de acesso.')
      }
    },
    async signOut() {
      tokenReader.invalidate()
      const { error } = await client.auth.signOut()
      if (error) {
        throw new Error('Não foi possível sair.')
      }
    },
    getAccessToken() {
      return tokenReader.getAccessToken()
    },
    onAuthStateChange(listener) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        listener(sessionFrom(session), event)
      })
      return () => data.subscription.unsubscribe()
    },
  }
}
