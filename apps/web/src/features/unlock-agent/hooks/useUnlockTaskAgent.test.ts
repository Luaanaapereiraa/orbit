import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UnlockTaskRunResponse } from '@destravai/contracts'
import { UnlockAgentError } from '../api/unlock-agent-errors'
import { makeTask } from '../../../test/factories'
import { useUnlockTaskAgent } from './useUnlockTaskAgent'

const completed: UnlockTaskRunResponse = {
  status: 'completed',
  runId: '550e8400-e29b-41d4-a716-446655440099',
  promptVersion: 'unlock-v1',
  generationMode: 'agent',
  createdAt: '2026-08-28T18:00:00.000Z',
  plan: {
    title: 'Comecar',
    summary: 'Resumo',
    nextAction: 'Abrir o arquivo',
    steps: [{ order: 1, title: 'Abrir', minutes: 5 }],
    totalMinutes: 20,
    recommendedFocusMinutes: 20,
    energy: 'medium',
    supportiveMessage: 'Vai',
  },
}

const task = makeTask({ id: 'task-a', title: 'Tarefa A' })

describe('useUnlockTaskAgent concurrency', () => {
  it('sends only one request when submit is called twice in the same tick', async () => {
    let resolveRun: (value: UnlockTaskRunResponse) => void = () => undefined
    const run = vi.fn(
      () =>
        new Promise<UnlockTaskRunResponse>((resolve) => {
          resolveRun = resolve
        }),
    )
    const { result } = renderHook(() =>
      useUnlockTaskAgent({
        initialTaskId: task.id,
        availableMinutes: 25,
        run,
      }),
    )

    let first: Promise<void> = Promise.resolve()
    let second: Promise<void> = Promise.resolve()
    await act(async () => {
      first = result.current.submit(task, '2026-08-29', [], async () => 'tok')
      second = result.current.submit(task, '2026-08-29', [], async () => 'tok')
    })

    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0]?.[0].clientRequestId).toBe(
      result.current.state.fields.clientRequestId,
    )

    await act(async () => {
      resolveRun(completed)
      await Promise.all([first, second])
    })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('ignores a late abort from request A after B started', async () => {
    let rejectA: (reason: unknown) => void = () => undefined
    let resolveB: (value: UnlockTaskRunResponse) => void = () => undefined
    const run = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<UnlockTaskRunResponse>((_resolve, reject) => {
            rejectA = reject
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<UnlockTaskRunResponse>((resolve) => {
            resolveB = resolve
          }),
      )

    const { result } = renderHook(() =>
      useUnlockTaskAgent({
        initialTaskId: task.id,
        availableMinutes: 25,
        run,
      }),
    )

    await act(async () => {
      void result.current.submit(task, '2026-08-29', [], async () => 'tok')
    })
    expect(result.current.state.status).toBe('submitting')

    await act(async () => {
      result.current.cancelWait()
      void result.current.submit(
        makeTask({ id: 'task-b', title: 'Tarefa B' }),
        '2026-08-29',
        [],
        async () => 'tok',
      )
    })

    await act(async () => {
      rejectA(new DOMException('Aborted', 'AbortError'))
    })
    expect(result.current.state.status).toBe('submitting')
    expect(result.current.state.submitted?.taskId).toBe('task-b')

    await act(async () => {
      resolveB(completed)
    })
    expect(result.current.state.status).toBe('completed')
    expect(result.current.state.submitted?.taskId).toBe('task-b')
  })

  it('does not let A finally release the lock of B', async () => {
    let finishA: () => void = () => undefined
    const run = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<UnlockTaskRunResponse>((_resolve, reject) => {
            finishA = () => reject(new DOMException('Aborted', 'AbortError'))
          }),
      )
      .mockImplementationOnce(async () => completed)

    const { result } = renderHook(() =>
      useUnlockTaskAgent({
        initialTaskId: task.id,
        availableMinutes: 25,
        run,
      }),
    )

    await act(async () => {
      void result.current.submit(task, '2026-08-29', [], async () => 'tok')
    })
    await act(async () => {
      result.current.cancelWait()
      void result.current.submit(
        makeTask({ id: 'task-b', title: 'Tarefa B' }),
        '2026-08-29',
        [],
        async () => 'tok',
      )
    })
    await act(async () => {
      finishA()
    })

    expect(result.current.state.status).toBe('completed')
    expect(result.current.state.submitted?.taskId).toBe('task-b')
  })

  it('does not update state after unmount', async () => {
    let resolveRun: (value: UnlockTaskRunResponse) => void = () => undefined
    const run = vi.fn(
      () =>
        new Promise<UnlockTaskRunResponse>((resolve) => {
          resolveRun = resolve
        }),
    )
    const { result, unmount } = renderHook(() =>
      useUnlockTaskAgent({
        initialTaskId: task.id,
        availableMinutes: 25,
        run,
      }),
    )

    await act(async () => {
      void result.current.submit(task, '2026-08-29', [], async () => 'tok')
    })
    unmount()
    await act(async () => {
      resolveRun(completed)
    })
    expect(result.current.state.status).toBe('submitting')
  })

  it('returns to the form on 400 and keeps the same fields', async () => {
    const run = vi.fn(async () => {
      throw new UnlockAgentError(
        'validation',
        'Alguns dados do pedido não são válidos. Revise o formulário.',
        {
          status: 400,
          details: [{ path: 'blockageDetails', message: 'Detalhe inválido' }],
        },
      )
    })
    const { result } = renderHook(() =>
      useUnlockTaskAgent({
        initialTaskId: task.id,
        availableMinutes: 25,
        run,
      }),
    )

    await act(async () => {
      result.current.patchFields({ blockageDetails: 'texto antigo' })
    })
    const requestId = result.current.state.fields.clientRequestId

    await act(async () => {
      await result.current.submit(task, '2026-08-29', [], async () => 'tok')
    })

    expect(result.current.state.status).toBe('form')
    if (result.current.state.status !== 'form') {
      return
    }
    expect(result.current.state.fields.blockageDetails).toBe('texto antigo')
    expect(result.current.state.formError?.status).toBe(400)
    expect(result.current.state.fieldErrors.blockageDetails).toBe(
      'Detalhe inválido',
    )
    expect(result.current.state.fields.clientRequestId).toBe(requestId)
  })

  it('keeps the same clientRequestId for 504 and cools down 409', async () => {
    const now = vi.fn(() => 1_000)
    const run = vi
      .fn()
      .mockRejectedValueOnce(
        new UnlockAgentError('timeout', 'A ajuda demorou demais.', {
          status: 504,
          retryable: true,
          sameRequest: true,
        }),
      )
      .mockRejectedValueOnce(
        new UnlockAgentError('in_progress', 'Ainda processando.', {
          status: 409,
          retryable: true,
          sameRequest: true,
        }),
      )

    const { result } = renderHook(() =>
      useUnlockTaskAgent({
        initialTaskId: task.id,
        availableMinutes: 25,
        run,
        now,
        retryCooldownMs: 1500,
      }),
    )
    const requestId = result.current.state.fields.clientRequestId

    await act(async () => {
      await result.current.submit(task, '2026-08-29', [], async () => 'tok')
    })
    expect(result.current.state.status).toBe('error')
    expect(result.current.state.fields.clientRequestId).toBe(requestId)

    await act(async () => {
      await result.current.submit(task, '2026-08-29', [], async () => 'tok')
    })
    expect(result.current.state.status).toBe('error')
    if (result.current.state.status !== 'error') {
      return
    }
    expect(result.current.state.fields.clientRequestId).toBe(requestId)
    expect(result.current.state.retryAvailableAt).toBe(2500)
  })
})
