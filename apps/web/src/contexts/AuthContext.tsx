'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { createSupabaseAuthClient } from '../lib/auth/supabase-auth'
import type { AuthClient, AuthSession } from '../lib/auth/types'
import { isPublicAuthConfigured } from '../lib/public-env'

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in'

interface AuthContextValue {
  status: AuthStatus
  session: AuthSession | null
  configured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const fallbackAuth: AuthContextValue = {
  status: 'signed-out',
  session: null,
  configured: false,
  async signIn() {
    throw new Error('A autenticação ainda não está configurada.')
  },
  async signUp() {
    throw new Error('A autenticação ainda não está configurada.')
  },
  async signOut() {},
}

const AuthContext = createContext<AuthContextValue>(fallbackAuth)

interface AuthProviderProps {
  children: ReactNode
  client?: AuthClient | null
  initialSession?: AuthSession | null
  skipBootstrap?: boolean
}

export function AuthProvider({
  children,
  client,
  initialSession = null,
  skipBootstrap = false,
}: AuthProviderProps) {
  const authClient = useMemo(
    () => (client === undefined ? createSupabaseAuthClient() : client),
    [client],
  )
  const configured = client === undefined ? isPublicAuthConfigured() : !!authClient
  const [session, setSession] = useState<AuthSession | null>(initialSession)
  const [status, setStatus] = useState<AuthStatus>(
    skipBootstrap ? (initialSession ? 'signed-in' : 'signed-out') : 'loading',
  )

  useEffect(() => {
    if (skipBootstrap) {
      return
    }

    if (!authClient) {
      setSession(null)
      setStatus('signed-out')
      return
    }

    let cancelled = false

    authClient
      .getSession()
      .then((next) => {
        if (cancelled) {
          return
        }
        setSession(next)
        setStatus(next ? 'signed-in' : 'signed-out')
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        setSession(null)
        setStatus('signed-out')
      })

    const unsubscribe = authClient.onAuthStateChange((next) => {
      setSession(next)
      setStatus(next ? 'signed-in' : 'signed-out')
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [authClient, skipBootstrap])

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!authClient) {
        throw new Error('A autenticação ainda não está configurada.')
      }
      const next = await authClient.signIn(email, password)
      setSession(next)
      setStatus('signed-in')
    },
    [authClient],
  )

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!authClient) {
        throw new Error('A autenticação ainda não está configurada.')
      }
      const next = await authClient.signUp(email, password)
      setSession(next)
      setStatus('signed-in')
    },
    [authClient],
  )

  const signOut = useCallback(async () => {
    if (!authClient) {
      setSession(null)
      setStatus('signed-out')
      return
    }
    await authClient.signOut()
    setSession(null)
    setStatus('signed-out')
  }, [authClient])

  const value = useMemo(
    () => ({
      status,
      session,
      configured,
      signIn,
      signUp,
      signOut,
    }),
    [configured, session, signIn, signOut, signUp, status],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
