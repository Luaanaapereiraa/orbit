import { createBrowserClient } from '@supabase/ssr'
import type { Session as SupabaseSession, SupabaseClient } from '@supabase/supabase-js'
import {
  isPublicAuthConfigured,
  readPublicSupabasePublishableKey,
  readPublicSupabaseUrl,
} from '../public-env'
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

export function createSupabaseBrowserClient(): AuthClient | null {
  if (!isPublicAuthConfigured()) {
    return null
  }

  const createClient = createBrowserClient as unknown as (
    url: string,
    key: string,
  ) => SupabaseClient

  const client = createClient(
    readPublicSupabaseUrl(),
    readPublicSupabasePublishableKey(),
  )

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
      const { error } = await client.auth.signOut()
      if (error) {
        throw new Error('Não foi possível sair.')
      }
    },
    async getAccessToken() {
      const { data } = await client.auth.getSession()
      return data.session?.access_token ?? null
    },
    onAuthStateChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener(sessionFrom(session))
      })
      return () => data.subscription.unsubscribe()
    },
  }
}
