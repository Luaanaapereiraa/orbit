import { generateKeyPair, SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import {
  createLocalJwtVerifier,
  createRemoteJwksVerifier,
} from '../auth/jwt-verifier.js'
import { testConfig } from './helpers.js'

describe('jwt verifier', () => {
  it('accepts a locally signed token without network access', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const issuer = 'https://example.supabase.co/auth/v1'
    const audience = 'authenticated'
    const verifier = createLocalJwtVerifier({
      key: publicKey,
      issuer,
      audience,
    })

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject('user-1')
      .setExpirationTime('5m')
      .sign(privateKey)

    await expect(verifier.verify(token)).resolves.toEqual({
      id: 'user-1',
      isAnonymous: false,
    })
  })

  it('creates a remote JWKS verifier without fetching until verify', () => {
    const verifier = createRemoteJwksVerifier(
      testConfig({
        supabaseUrl: 'https://example.supabase.co',
        jwtIssuer: 'https://example.supabase.co/auth/v1',
        jwksUrl: 'https://example.supabase.co/auth/v1/.well-known/jwks.json',
      }),
    )
    expect(typeof verifier.verify).toBe('function')
  })
})
