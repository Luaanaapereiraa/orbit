export interface AuthUser {
  id: string
  isAnonymous: boolean
}

export interface JwtVerifier {
  verify(token: string): Promise<AuthUser>
}
