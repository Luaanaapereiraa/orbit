'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createSupabaseBrowserClient } from '../lib/auth/supabase-browser'
import type {
  AuthChangeEvent,
  AuthClient,
  AuthContextValue,
  Session,
  SignUpProfile,
  SignUpResult,
} from '../lib/auth/types'
import { isPublicAuthConfigured } from '../lib/public-env'

const AUTH_NOT_CONFIGURED = 'A autenticação ainda não está configurada.'

async function notConfigured(): Promise<never> {
  throw new Error(AUTH_NOT_CONFIGURED)
}

const fallbackAuth: AuthContextValue = {
  user: null,
  session: null,
  isLoading: false,
  configured: false,
  signInWithPassword: notConfigured,
  signUpWithPassword: notConfigured,
  signInWithGoogle: notConfigured,
  resetPasswordForEmail: notConfigured,
  updatePassword: notConfigured,
  async signOut() {
    return undefined
  },
  async getAccessToken() {
    return null
  },
}

const AuthContext = createContext<AuthContextValue>(fallbackAuth)

interface AuthProviderProps {
  children: ReactNode
  client?: AuthClient | null
  initialSession?: Session | null
  skipBootstrap?: boolean
}

export function AuthProvider({
  children,
  client,
  initialSession = null,
  skipBootstrap = false,
}: AuthProviderProps) {
  const authClient = useMemo(
    () => (client === undefined ? createSupabaseBrowserClient() : client),
    [client],
  )
  const configured =
    client === undefined ? isPublicAuthConfigured() : !!authClient
  const [session, setSession] = useState<Session | null>(initialSession)
  const [isLoading, setIsLoading] = useState(
    skipBootstrap ? false : !initialSession,
  )
  const signedOutRef = useRef(false)

  function applyAuthEvent(next: Session | null, event?: AuthChangeEvent) {
    if (signedOutRef.current) {
      if (event === 'SIGNED_IN' && next) {
        signedOutRef.current = false
        setSession(next)
        setIsLoading(false)
      }
      return
    }

    setSession(next)
    setIsLoading(false)
  }

  useEffect(() => {
    if (!authClient) {
      setSession(null)
      setIsLoading(false)
      return
    }

    let cancelled = false

    if (!skipBootstrap) {
      authClient
        .getSession()
        .then((next) => {
          if (cancelled || signedOutRef.current) {
            return
          }
          setSession(next)
          setIsLoading(false)
        })
        .catch(() => {
          if (cancelled) {
            return
          }
          setSession(null)
          setIsLoading(false)
        })
    }

    const unsubscribe = authClient.onAuthStateChange((next, event) => {
      if (cancelled) {
        return
      }
      applyAuthEvent(next, event)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [authClient, skipBootstrap])

  const requireClient = useCallback(() => {
    if (!authClient) {
      throw new Error(AUTH_NOT_CONFIGURED)
    }
    return authClient
  }, [authClient])

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      await requireClient().signInWithPassword(email, password)
    },
    [requireClient],
  )

  const signUpWithPassword = useCallback(
    async (
      email: string,
      password: string,
      profile: SignUpProfile,
    ): Promise<SignUpResult> => {
      return requireClient().signUpWithPassword(email, password, profile)
    },
    [requireClient],
  )

  const signInWithGoogle = useCallback(async () => {
    await requireClient().signInWithGoogle()
  }, [requireClient])

  const resetPasswordForEmail = useCallback(
    async (email: string) => {
      await requireClient().resetPasswordForEmail(email)
    },
    [requireClient],
  )

  const updatePassword = useCallback(
    async (password: string) => {
      await requireClient().updatePassword(password)
    },
    [requireClient],
  )

  const signOut = useCallback(async () => {
    signedOutRef.current = true
    setSession(null)
    setIsLoading(false)
    if (!authClient) {
      return
    }
    await authClient.signOut()
  }, [authClient])

  const getAccessToken = useCallback(async () => {
    if (authClient) {
      return authClient.getAccessToken()
    }
    return session?.accessToken ?? null
  }, [authClient, session])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      isLoading,
      configured,
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      resetPasswordForEmail,
      updatePassword,
      signOut,
      getAccessToken,
    }),
    [
      configured,
      getAccessToken,
      isLoading,
      resetPasswordForEmail,
      session,
      signInWithGoogle,
      signInWithPassword,
      signOut,
      signUpWithPassword,
      updatePassword,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
