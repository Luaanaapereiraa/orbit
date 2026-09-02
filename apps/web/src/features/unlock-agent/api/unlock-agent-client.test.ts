import { describe, expect, it, vi } from 'vitest'
import { UnlockTaskRunRequestSchema } from '@destravai/contracts'
import { runUnlockTaskAgent } from './unlock-agent-client'
import { UnlockAgentError } from './unlock-agent-errors'

const request = UnlockTaskRunRequestSchema.parse({
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

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('runUnlockTaskAgent', () => {
  it('posts only to the same-origin proxy with the bearer token', async () => {
    const fetchImpl = vi.fn(
      async (
        url: string,
        init?: { headers?: Record<string, string>; body?: string },
      ) => {
        expect(url).toBe('/api/agents/unlock-task/runs')
        expect(init?.headers?.authorization).toBe('Bearer user-jwt')
        expect(String(init?.body)).not.toMatch(/agent_runs|unlock_plans|rpc/i)
        return jsonResponse(
          {
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
          },
          200,
        )
      },
    )

    const result = await runUnlockTaskAgent(request, 'user-jwt', { fetchImpl })
    expect(result.status).toBe('completed')
  })

  it('maps HTTP errors without leaking tokens or payloads', async () => {
    const cases = [
      [401, 'unauthenticated'],
      [409, 'in_progress'],
      [429, 'quota_exceeded'],
      [502, 'provider_error'],
      [503, 'temporarily_unavailable'],
      [504, 'timeout'],
    ] as const

    for (const [status, code] of cases) {
      const fetchImpl = vi.fn(async () =>
        jsonResponse(
          {
            error: {
              code: 'INTERNAL_ERROR',
              message: 'secret token=user-jwt',
              requestId: 'req-1',
            },
          },
          status,
        ),
      )

      await expect(
        runUnlockTaskAgent(request, 'user-jwt', { fetchImpl }),
      ).rejects.toMatchObject({ name: 'UnlockAgentError', code })
    }
  })

  it('rejects an invalid response body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: 'nope' }, 200))

    await expect(
      runUnlockTaskAgent(request, 'user-jwt', { fetchImpl }),
    ).rejects.toBeInstanceOf(UnlockAgentError)
  })

  it('maps a network failure and supports abort', async () => {
    await expect(
      runUnlockTaskAgent(request, 'user-jwt', {
        fetchImpl: async () => {
          throw new TypeError('Failed to fetch')
        },
      }),
    ).rejects.toMatchObject({ code: 'network' })

    const controller = new AbortController()
    controller.abort()
    await expect(
      runUnlockTaskAgent(request, 'user-jwt', {
        signal: controller.signal,
        fetchImpl: async (_url, init) => {
          if (init?.signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError')
          }
          return jsonResponse({}, 200)
        },
      }),
    ).rejects.toMatchObject({ code: 'timeout', sameRequest: true })
  })
})
