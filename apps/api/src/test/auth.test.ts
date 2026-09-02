import { ApiErrorResponseSchema, MeResponseSchema } from '@destravai/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildTestApp,
  createTestVerifier,
  signTestJwt,
} from './helpers.js'

describe('authentication', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>> | undefined

  afterEach(async () => {
    if (app) {
      await app.close()
      app = undefined
    }
  })

  it('rejects missing authorization', async () => {
    app = await buildTestApp()
    const response = await app.inject({ method: 'GET', url: '/v1/me' })
    expect(response.statusCode).toBe(401)
    const body = ApiErrorResponseSchema.parse(response.json())
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(body.error.requestId).toBeTruthy()
  })

  it('rejects a malformed bearer header', async () => {
    app = await buildTestApp()
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: 'Basic abc' },
    })
    expect(response.statusCode).toBe(401)
  })

  it('rejects an invalid token', async () => {
    const { verifier } = await createTestVerifier()
    app = await buildTestApp({ jwtVerifier: verifier })
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: 'Bearer not-a-jwt' },
    })
    expect(response.statusCode).toBe(401)
  })

  it('rejects an expired token', async () => {
    const keys = await createTestVerifier()
    app = await buildTestApp({ jwtVerifier: keys.verifier })
    const token = await signTestJwt(keys.privateKey, { expired: true })
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.statusCode).toBe(401)
  })

  it('rejects a token with the wrong audience', async () => {
    const keys = await createTestVerifier()
    app = await buildTestApp({ jwtVerifier: keys.verifier })
    const token = await signTestJwt(keys.privateKey, { audience: 'service' })
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.statusCode).toBe(401)
  })

  it('returns the authenticated user', async () => {
    const keys = await createTestVerifier()
    app = await buildTestApp({ jwtVerifier: keys.verifier })
    const token = await signTestJwt(keys.privateKey, { subject: 'user-42' })
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.statusCode).toBe(200)
    const body = MeResponseSchema.parse(response.json())
    expect(body.user).toEqual({ id: 'user-42', isAnonymous: false })
  })

  it('returns 401 when auth context is missing after a successful header', async () => {
    app = await buildTestApp({
      jwtVerifier: {
        async verify() {
          return undefined as never
        },
      },
    })
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: 'Bearer valid-looking-token' },
    })
    expect(response.statusCode).toBe(401)
    const body = ApiErrorResponseSchema.parse(response.json())
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(body.error.message).toBe('Authentication required')
  })

  it('returns an anonymous user from the JWT claim', async () => {
    const keys = await createTestVerifier()
    app = await buildTestApp({ jwtVerifier: keys.verifier })
    const token = await signTestJwt(keys.privateKey, {
      subject: 'anon-9',
      isAnonymous: true,
    })
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().user).toEqual({ id: 'anon-9', isAnonymous: true })
  })
})
