import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import {
  isPublicAuthConfigured,
  readPublicSupabasePublishableKey,
  readPublicSupabaseUrl,
} from '../public-env'
import type { AuthClient, AuthSession } from './types'

function sessionFrom(session: Session | null): AuthSession | null {
  if (!session?.access_token || !session.user?.id) {
    return null
  }

  return {
    accessToken: session.access_token,
    userId: session.user.id,
    email: session.user.email ?? null,
    isAnonymous: session.user.is_anonymous === true,
  }
}

export function createSupabaseAuthClient(): AuthClient | null {
  if (!isPublicAuthConfigured()) {
    return null
  }

  const client = createClient(
    readPublicSupabaseUrl(),
    readPublicSupabasePublishableKey(),
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  ) as SupabaseClient

  return {
    async getSession() {
      const { data, error } = await client.auth.getSession()
      if (error) {
        throw new Error('Não foi possível ler a sessão.')
      }
      return sessionFrom(data.session)
    },
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      })
      if (error || !data.session) {
        throw new Error('E-mail ou senha inválidos.')
      }
      const session = sessionFrom(data.session)
      if (!session) {
        throw new Error('E-mail ou senha inválidos.')
      }
      return session
    },
    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password })
      if (error) {
        throw new Error('Não foi possível criar a conta.')
      }
      const session = sessionFrom(data.session)
      if (!session) {
        throw new Error(
          'Conta criada. Confirme o e-mail, se o projeto exigir, e entre de novo.',
        )
      }
      return session
    },
    async signOut() {
      const { error } = await client.auth.signOut()
      if (error) {
        throw new Error('Não foi possível sair.')
      }
    },
    onAuthStateChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener(sessionFrom(session))
      })
      return () => data.subscription.unsubscribe()
    },
  }
}
