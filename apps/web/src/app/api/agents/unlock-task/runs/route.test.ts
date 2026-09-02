import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UnlockTaskRunRequestSchema } from '@destravai/contracts'
import { POST } from './route'

const requestBody = UnlockTaskRunRequestSchema.parse({
  clientRequestId: '550e8400-e29b-41d4-a716-446655440000',
  task: {
    id: 'task-1',
    title: 'Escrever testes',
    nextAction: null,
    energy: 'medium',
    estimatedMinutes: 25,
    status: 'active',
  },
  blockageReason: 'dont_know_where_to_start',
  blockageDetails: null,
  availableMinutes: 20,
  currentEnergy: 'low',
  today: {
    date: '2026-08-28',
    role: 'essential',
    plannedTaskCount: 1,
  },
  locale: 'pt-BR',
})

const completed = {
  status: 'completed',
  runId: '550e8400-e29b-41d4-a716-446655440099',
  promptVersion: 'unlock-v1',
  generationMode: 'agent',
  createdAt: '2026-08-28T18:00:00.000Z',
  plan: {
    title: 'Comecar a apresentacao',
    summary: 'Dois passos pequenos para sair do zero.',
    nextAction: 'Abrir o arquivo e escrever o titulo',
    steps: [
      { order: 1, title: 'Abrir o arquivo', minutes: 5 },
      { order: 2, title: 'Escrever o titulo', minutes: 15 },
    ],
    totalMinutes: 20,
    recommendedFocusMinutes: 20,
    energy: 'medium',
    supportiveMessage: 'Um passo pequeno ja conta.',
  },
}

function proxyRequest(body: unknown, token = 'user-jwt') {
  return new Request('http://localhost/api/agents/unlock-task/runs', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('unlock-task proxy', () => {
  const previousApiUrl = process.env.DESTRAVAI_API_URL

  afterEach(() => {
    vi.unstubAllGlobals()
    if (previousApiUrl === undefined) {
      delete process.env.DESTRAVAI_API_URL
    } else {
      process.env.DESTRAVAI_API_URL = previousApiUrl
    }
  })

  beforeEach(() => {
    process.env.DESTRAVAI_API_URL = 'http://localhost:3333'
  })

  it('forwards a valid request with only the needed headers', async () => {
    const fetchImpl = vi.fn(
      async (url: string, init?: { headers?: Record<string, string> }) => {
        expect(url).toBe('http://localhost:3333/v1/agents/unlock-task/runs')
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer user-jwt',
          'content-type': 'application/json',
        })
        expect(JSON.stringify(init?.headers)).not.toMatch(/cookie/i)
        return new Response(JSON.stringify(completed), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    )
    vi.stubGlobal('fetch', fetchImpl)

    const response = await POST(proxyRequest(requestBody))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ status: 'completed' })
  })

  it('rejects an invalid body and an invalid upstream payload', async () => {
    const invalid = await POST(proxyRequest({ nope: true }))
    expect(invalid.status).toBe(400)

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: 'nope' }), { status: 200 }),
      ),
    )
    const badUpstream = await POST(proxyRequest(requestBody))
    expect(badUpstream.status).toBe(502)
    const body = await badUpstream.json()
    expect(JSON.stringify(body)).not.toContain('user-jwt')
  })

  it('returns 401 without a bearer token', async () => {
    const response = await POST(
      new Request('http://localhost/api/agents/unlock-task/runs', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      }),
    )
    expect(response.status).toBe(401)
  })
})
