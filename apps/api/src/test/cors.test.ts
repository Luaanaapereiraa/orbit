import { afterEach, describe, expect, it } from 'vitest'
import { buildTestApp } from './helpers.js'

describe('CORS', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>> | undefined

  afterEach(async () => {
    if (app) {
      await app.close()
      app = undefined
    }
  })

  it('allows a configured origin', async () => {
    app = await buildTestApp()
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:3000' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    )
  })

  it('does not reflect a denied origin', async () => {
    app = await buildTestApp()
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example' },
    })
    expect(response.headers['access-control-allow-origin']).not.toBe(
      'https://evil.example',
    )
  })

  it('does not use a wildcard on an authenticated route', async () => {
    app = await buildTestApp()
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { origin: 'https://evil.example' },
    })
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
    expect(response.headers['access-control-allow-origin']).not.toBe('*')
  })
})
