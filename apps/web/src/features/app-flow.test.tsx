import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PomodoroProvider } from '../contexts/PomodoroContext'
import { Home } from '../features/home/Home'
import { History } from '../features/history/History'
import {
  persistPomodoroState,
  STORAGE_KEY,
  STORAGE_KEY_DESTRAVAI,
} from '../lib/storage'
import { makeCycle, makeState, makeTask } from '../test/factories'

function renderHome() {
  return render(
    <PomodoroProvider>
      <Home />
    </PomodoroProvider>,
  )
}

describe('Home', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('creates a task from the form and keeps start disabled until then', async () => {
    const user = userEvent.setup()
    renderHome()

    expect(screen.getByRole('button', { name: /começar/i })).toBeDisabled()

    await user.type(
      screen.getByPlaceholderText('Nova tarefa'),
      'Estudar testes',
    )
    await user.click(screen.getByRole('button', { name: /adicionar tarefa/i }))

    expect(
      screen.getByRole('button', { name: 'Estudar testes' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /começar/i })).toBeEnabled()
  })

  it('selects a task and starts the timer with a title snapshot', async () => {
    persistPomodoroState(
      makeState({
        selectedTaskId: 'task-1',
        tasks: [makeTask({ id: 'task-1', title: 'Estudar testes' })],
      }),
    )
    const user = userEvent.setup()
    renderHome()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /começar/i })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: /começar/i }))

    expect(screen.getByRole('button', { name: /pausar/i })).toBeInTheDocument()
    expect(screen.getAllByText('Estudar testes').length).toBeGreaterThan(0)
  })

  it('hides done and archived tasks from the panel', async () => {
    persistPomodoroState(
      makeState({
        selectedTaskId: 'task-active',
        tasks: [
          makeTask({ id: 'task-active', title: 'Ativa', status: 'active' }),
          makeTask({
            id: 'task-inbox',
            title: 'Caixa de entrada',
            status: 'inbox',
            position: 1,
          }),
          makeTask({
            id: 'task-done',
            title: 'Concluída',
            status: 'done',
            completedAt: '2026-01-01T12:00:00.000Z',
            position: 2,
          }),
          makeTask({
            id: 'task-archived',
            title: 'Arquivada',
            status: 'archived',
            position: 3,
          }),
        ],
      }),
    )

    renderHome()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ativa' })).toBeInTheDocument()
    })

    expect(
      screen.getByRole('button', { name: 'Caixa de entrada' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Concluída' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Arquivada' })).toBeNull()
  })
})

describe('History', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('shows an empty state when there are no cycles', () => {
    render(
      <PomodoroProvider>
        <History />
      </PomodoroProvider>,
    )

    expect(
      screen.getByText('Nenhum ciclo registrado ainda.'),
    ).toBeInTheDocument()
  })
})

describe('client hydration', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('restores saved tasks after mount without overwriting storage first', async () => {
    persistPomodoroState(
      makeState({
        selectedTaskId: 'task-1',
        tasks: [makeTask({ id: 'task-1', title: 'Tarefa salva' })],
      }),
    )

    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    render(
      <PomodoroProvider>
        <Home />
      </PomodoroProvider>,
    )

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Tarefa salva' }),
      ).toBeInTheDocument()
    })

    const persistedWrites = setItem.mock.calls.filter(
      ([key]) => key === STORAGE_KEY_DESTRAVAI,
    )

    expect(persistedWrites.length).toBeGreaterThan(0)
    expect(JSON.parse(String(persistedWrites[0][1])).state.selectedTaskId).toBe(
      'task-1',
    )
    expect(localStorage.getItem(STORAGE_KEY_DESTRAVAI)).toContain(
      'Tarefa salva',
    )
  })

  it('migrates v2 storage in memory without writing an empty state first', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        selectedTaskId: 'task-1',
        tasks: [
          {
            id: 'task-1',
            name: 'Tarefa migrada',
            createdAt: '2026-01-01T10:00:00.000Z',
          },
        ],
        cycles: [],
      }),
    )

    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    render(
      <PomodoroProvider>
        <Home />
      </PomodoroProvider>,
    )

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Tarefa migrada' }),
      ).toBeInTheDocument()
    })

    const persistedWrites = setItem.mock.calls.filter(
      ([key]) => key === STORAGE_KEY_DESTRAVAI,
    )

    expect(persistedWrites.length).toBeGreaterThan(0)
    expect(JSON.parse(String(persistedWrites[0][1])).state.tasks[0].title).toBe(
      'Tarefa migrada',
    )
    expect(localStorage.getItem(STORAGE_KEY)).toContain('Tarefa migrada')
  })

  it('does not wipe completed plan references after hydration persist', async () => {
    persistPomodoroState(
      makeState({
        selectedTaskId: 'task-active',
        tasks: [
          makeTask({ id: 'task-active', title: 'Ativa', status: 'active' }),
          makeTask({
            id: 'task-done',
            title: 'Concluída',
            status: 'done',
            completedAt: '2026-01-01T12:00:00.000Z',
            position: 1,
          }),
        ],
        dailyPlans: [
          {
            date: '2026-01-01',
            essentialTaskId: 'task-done',
            secondaryTaskIds: [],
            createdAt: '2026-01-01T12:00:00.000Z',
            updatedAt: '2026-01-01T12:00:00.000Z',
          },
        ],
      }),
    )

    render(
      <PomodoroProvider>
        <Home />
      </PomodoroProvider>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ativa' })).toBeInTheDocument()
    })

    const stored = JSON.parse(
      String(localStorage.getItem(STORAGE_KEY_DESTRAVAI)),
    )
    expect(stored.state.dailyPlans[0].essentialTaskId).toBe('task-done')
    expect(stored.state.tasks[1].status).toBe('done')
  })

  it('restores an active cycle after refresh without writing empty state first', async () => {
    persistPomodoroState(
      makeState({
        selectedTaskId: 'task-1',
        tasks: [makeTask({ id: 'task-1', title: 'Estudar testes' })],
        cycles: [
          makeCycle({
            id: 'cycle-1',
            task: 'Estudar testes',
            taskId: 'task-1',
          }),
        ],
        activeCycleId: 'cycle-1',
      }),
    )

    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    render(
      <PomodoroProvider>
        <Home />
      </PomodoroProvider>,
    )

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /pausar/i }),
      ).toBeInTheDocument()
    })

    const persistedWrites = setItem.mock.calls.filter(
      ([key]) => key === STORAGE_KEY_DESTRAVAI,
    )

    expect(persistedWrites.length).toBeGreaterThan(0)
    expect(JSON.parse(String(persistedWrites[0][1])).state.activeCycleId).toBe(
      'cycle-1',
    )
  })
})
