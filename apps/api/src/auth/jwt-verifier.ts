import { createRemoteJWKSet, jwtVerify, type JWTPayload, type KeyLike } from 'jose'
import type { AppConfig } from '../config/env.js'
import type { AuthUser, JwtVerifier } from './types.js'

export class JwtVerificationError extends Error {
  constructor(message = 'Invalid token') {
    super(message)
    this.name = 'JwtVerificationError'
  }
}

function readAnonymousClaim(payload: JWTPayload) {
  if (payload.is_anonymous === true) {
    return true
  }

  const appMetadata = payload.app_metadata
  if (
    typeof appMetadata === 'object' &&
    appMetadata !== null &&
    'is_anonymous' in appMetadata &&
    appMetadata.is_anonymous === true
  ) {
    return true
  }

  return false
}

export function payloadToAuthUser(payload: JWTPayload): AuthUser {
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new JwtVerificationError('Invalid token')
  }

  return {
    id: payload.sub,
    isAnonymous: readAnonymousClaim(payload),
  }
}

export function createLocalJwtVerifier(options: {
  key: KeyLike | Uint8Array
  issuer: string
  audience: string
}): JwtVerifier {
  return {
    async verify(token: string) {
      try {
        const { payload } = await jwtVerify(token, options.key, {
          issuer: options.issuer,
          audience: options.audience,
        })
        return payloadToAuthUser(payload)
      } catch {
        throw new JwtVerificationError('Invalid token')
      }
    },
  }
}

export function createRemoteJwksVerifier(config: AppConfig): JwtVerifier {
  if (!config.jwksUrl || !config.jwtIssuer) {
    return {
      async verify() {
        throw new JwtVerificationError('Invalid token')
      },
    }
  }

  const JWKS = createRemoteJWKSet(new URL(config.jwksUrl), {
    cacheMaxAge: 600_000,
    cooldownDuration: 30_000,
  })

  return {
    async verify(token: string) {
      try {
        const { payload } = await jwtVerify(token, JWKS, {
          issuer: config.jwtIssuer,
          audience: config.jwtAudience,
        })
        return payloadToAuthUser(payload)
      } catch {
        throw new JwtVerificationError('Invalid token')
      }
    },
  }
}
