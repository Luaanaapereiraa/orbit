export type User = {
  id: string
  email: string | null
}

export type Session = {
  accessToken: string
  user: User
}

export type AuthChangeEvent =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | string

export interface AuthClient {
  getSession(): Promise<Session | null>
  signInWithEmail(email: string): Promise<void>
  signOut(): Promise<void>
  getAccessToken(): Promise<string | null>
  onAuthStateChange(
    listener: (session: Session | null, event?: AuthChangeEvent) => void,
  ): () => void
}

export type AuthContextValue = {
  user: User | null
  session: Session | null
  isLoading: boolean
  configured: boolean
  signInWithEmail(email: string): Promise<void>
  signOut(): Promise<void>
  getAccessToken(): Promise<string | null>
}
