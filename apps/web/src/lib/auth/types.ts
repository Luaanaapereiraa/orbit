import type { Craft, SignUpProfile } from './profile'

export type { Craft, SignUpProfile }

export type User = {
  id: string
  email: string | null
  displayName: string | null
  craft: Craft | null
}

export type Session = {
  accessToken: string
  user: User
}

export type SignUpResult = {
  needsEmailConfirmation: boolean
}

export type AuthChangeEvent =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'PASSWORD_RECOVERY'
  | string

export interface AuthClient {
  getSession(): Promise<Session | null>
  signInWithPassword(email: string, password: string): Promise<void>
  signUpWithPassword(
    email: string,
    password: string,
    profile: SignUpProfile,
  ): Promise<SignUpResult>
  signInWithGoogle(): Promise<void>
  resetPasswordForEmail(email: string): Promise<void>
  updatePassword(password: string): Promise<void>
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
  signInWithPassword(email: string, password: string): Promise<void>
  signUpWithPassword(
    email: string,
    password: string,
    profile: SignUpProfile,
  ): Promise<SignUpResult>
  signInWithGoogle(): Promise<void>
  resetPasswordForEmail(email: string): Promise<void>
  updatePassword(password: string): Promise<void>
  signOut(): Promise<void>
  getAccessToken(): Promise<string | null>
}
