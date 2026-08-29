export interface AuthSession {
  accessToken: string
  userId: string
  email: string | null
  isAnonymous: boolean
}

export interface AuthClient {
  getSession(): Promise<AuthSession | null>
  signIn(email: string, password: string): Promise<AuthSession>
  signUp(email: string, password: string): Promise<AuthSession>
  signOut(): Promise<void>
  onAuthStateChange(listener: (session: AuthSession | null) => void): () => void
}
