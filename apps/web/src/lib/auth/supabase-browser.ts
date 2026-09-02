import type {
  Session as SupabaseSession,
  SupabaseClient,
} from '@supabase/supabase-js'
import { createSupabaseBrowserClient as createBrowserSupabase } from '../supabase/client'
import { isPublicAuthConfigured } from '../public-env'
import { createAccessTokenReader } from './access-token'
import { profileFromMetadata } from './profile'
import type { AuthClient, Session, SignUpProfile } from './types'

function sessionFrom(session: SupabaseSession | null): Session | null {
  if (!session?.access_token || !session.user?.id) {
    return null
  }

  const profile = profileFromMetadata(session.user.user_metadata)

  return {
    accessToken: session.access_token,
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
      displayName: profile.displayName,
      craft: profile.craft,
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

function authRedirectTo(type?: 'recovery') {
  if (typeof window === 'undefined') {
    return undefined
  }

  const url = new URL('/auth/callback', window.location.origin)
  if (type === 'recovery') {
    url.searchParams.set('type', 'recovery')
  }
  return url.toString()
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
    async signInWithPassword(email, password) {
      const { error } = await client.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        throw new Error('Não foi possível entrar. Confira o e-mail e a senha.')
      }
    },
    async signUpWithPassword(email, password, profile: SignUpProfile) {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: authRedirectTo(),
          data: {
            display_name: profile.displayName,
            craft: profile.craft,
          },
        },
      })
      if (error) {
        throw new Error('Não foi possível criar a conta. Tente de novo.')
      }
      return { needsEmailConfirmation: !data.session }
    },
    async signInWithGoogle() {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: authRedirectTo(),
        },
      })
      if (error) {
        throw new Error('Não foi possível continuar com o Google.')
      }
    },
    async resetPasswordForEmail(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: authRedirectTo('recovery'),
      })
      if (error) {
        throw new Error('Não foi possível enviar o e-mail de recuperação.')
      }
    },
    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password })
      if (error) {
        throw new Error('Não foi possível atualizar a senha.')
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
