import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { persistPomodoroState, STORAGE_KEY_DESTRAVAI } from '../lib/storage'
import { makeState, makeTask } from '../test/factories'
import { PomodoroProvider, usePomodoro } from './PomodoroContext'

function storedCycles() {
  return JSON.parse(String(localStorage.getItem(STORAGE_KEY_DESTRAVAI) ?? '{}'))
    .state.cycles as Array<{
    id: string
    interruptedDate?: string
    taskId: string
  }>
}

function FocusProbe({ taskId = 'task-1' }: { taskId?: string }) {
  const { startFocusForTask, interruptCurrentCycle } = usePomodoro()

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          const first = startFocusForTask(taskId)
          const second = startFocusForTask(taskId)
          document.body.dataset.first = first.status
          document.body.dataset.second = second.status
          document.body.dataset.firstCycle =
            first.status === 'started' || first.status === 'active_cycle_exists'
              ? first.cycleId
              : ''
          document.body.dataset.secondCycle =
            second.status === 'started' ||
            second.status === 'active_cycle_exists'
              ? second.cycleId
              : ''
        }}
      >
        start-twice
      </button>
      <button
        type="button"
        onClick={() => {
          const result = startFocusForTask(taskId)
          document.body.dataset.after = result.status
        }}
      >
        start-once
      </button>
      <button type="button" onClick={() => interruptCurrentCycle()}>
        interrupt
      </button>
    </div>
  )
}

describe('startFocusForTask concurrency', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
    delete document.body.dataset.first
    delete document.body.dataset.second
    delete document.body.dataset.firstCycle
    delete document.body.dataset.secondCycle
    delete document.body.dataset.after
  })

  it('starts only one cycle when called twice in the same tick', async () => {
    persistPomodoroState(
      makeState({
        tasks: [makeTask({ id: 'task-1', title: 'Escrever o parágrafo' })],
      }),
    )
    render(
      <PomodoroProvider>
        <FocusProbe />
      </PomodoroProvider>,
    )
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'start-twice' }))

    expect(document.body.dataset.first).toBe('started')
    expect(['start_in_progress', 'active_cycle_exists']).toContain(
      document.body.dataset.second,
    )
    if (document.body.dataset.second === 'active_cycle_exists') {
      expect(document.body.dataset.secondCycle).toBe(
        document.body.dataset.firstCycle,
      )
    }

    await waitFor(() => {
      const cycles = storedCycles()
      expect(cycles).toHaveLength(1)
      expect(cycles[0]?.id).toBe(document.body.dataset.firstCycle)
      expect(cycles[0]?.interruptedDate).toBeUndefined()
    })
  })

  it('rejects a missing task without creating a cycle', async () => {
    persistPomodoroState(makeState({ tasks: [] }))
    render(
      <PomodoroProvider>
        <FocusProbe taskId="missing" />
      </PomodoroProvider>,
    )
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'start-once' }))
    expect(document.body.dataset.after).toBe('task_not_found')
    expect(storedCycles() ?? []).toEqual([])
  })

  it('rejects an ineligible task without creating a cycle', async () => {
    persistPomodoroState(
      makeState({
        tasks: [
          makeTask({
            id: 'task-1',
            title: 'Escrever o parágrafo',
            status: 'done',
            completedAt: '2026-08-29T12:00:00.000Z',
          }),
        ],
      }),
    )
    render(
      <PomodoroProvider>
        <FocusProbe />
      </PomodoroProvider>,
    )
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'start-once' }))
    expect(document.body.dataset.after).toBe('task_not_eligible')
    expect(storedCycles() ?? []).toEqual([])
  })

  it('returns active_cycle_exists when a cycle is already running', async () => {
    persistPomodoroState(
      makeState({
        tasks: [makeTask({ id: 'task-1', title: 'Escrever o parágrafo' })],
        cycles: [
          {
            id: 'cycle-1',
            type: 'focus',
            task: 'Escrever o parágrafo',
            taskId: 'task-1',
            minutesAmount: 25,
            startDate: new Date('2026-08-29T12:00:00.000Z'),
            pausedMs: 0,
          },
        ],
        activeCycleId: 'cycle-1',
      }),
    )
    render(
      <PomodoroProvider>
        <FocusProbe />
      </PomodoroProvider>,
    )
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'start-once' }))
    expect(document.body.dataset.after).toBe('active_cycle_exists')
    expect(storedCycles()).toHaveLength(1)
  })

  it('allows a new start after the previous cycle is interrupted', async () => {
    persistPomodoroState(
      makeState({
        tasks: [makeTask({ id: 'task-1', title: 'Escrever o parágrafo' })],
      }),
    )
    render(
      <PomodoroProvider>
        <FocusProbe />
      </PomodoroProvider>,
    )
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'start-twice' }))
    await user.click(screen.getByRole('button', { name: 'interrupt' }))
    await user.click(screen.getByRole('button', { name: 'start-once' }))
    expect(document.body.dataset.after).toBe('started')
    await waitFor(() => {
      expect(storedCycles()).toHaveLength(2)
    })
  })
})
