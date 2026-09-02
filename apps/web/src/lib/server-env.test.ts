import { afterEach, describe, expect, it } from 'vitest'
import { readDestravaiApiUrl, ServerEnvError } from './server-env'

describe('readDestravaiApiUrl', () => {
  const previous = process.env.DESTRAVAI_API_URL

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.DESTRAVAI_API_URL
    } else {
      process.env.DESTRAVAI_API_URL = previous
    }
  })

  it('requires the URL outside of an injected value', () => {
    expect(() => readDestravaiApiUrl({})).toThrow(ServerEnvError)
    expect(() => readDestravaiApiUrl({ NODE_ENV: 'development' })).toThrow(
      /DESTRAVAI_API_URL não está configurada/,
    )
    expect(() => readDestravaiApiUrl({ NODE_ENV: 'production' })).toThrow(
      ServerEnvError,
    )
  })

  it('accepts a valid http URL in non-production', () => {
    expect(
      readDestravaiApiUrl({ DESTRAVAI_API_URL: 'http://127.0.0.1:3333/' }),
    ).toBe('http://127.0.0.1:3333')
  })

  it('rejects an invalid URL', () => {
    expect(() =>
      readDestravaiApiUrl({ DESTRAVAI_API_URL: 'not-a-url' }),
    ).toThrow(/não é uma URL válida/)
  })

  it('rejects http in production', () => {
    expect(() =>
      readDestravaiApiUrl({
        NODE_ENV: 'production',
        DESTRAVAI_API_URL: 'http://api.example.com',
      }),
    ).toThrow(/https em produção/)
  })

  it('rejects credentials in the URL', () => {
    expect(() =>
      readDestravaiApiUrl({
        DESTRAVAI_API_URL: 'https://user:secret@api.example.com',
      }),
    ).toThrow(/credenciais/)
  })

  it('accepts https in production and strips the trailing slash', () => {
    expect(
      readDestravaiApiUrl({
        NODE_ENV: 'production',
        DESTRAVAI_API_URL: 'https://api.example.com/v1/',
      }),
    ).toBe('https://api.example.com/v1')
  })
})
