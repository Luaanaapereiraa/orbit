import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PomodoroProvider } from '../contexts/PomodoroContext'
import { Home } from '../features/home/Home'
import { History } from '../features/history/History'
import { persistPomodoroState, STORAGE_KEY } from '../lib/storage'
import { makeState } from '../test/factories'

function renderHome() {
  return render(
    <PomodoroProvider>
      <Home />
    </PomodoroProvider>,
  )
}

describe('Home', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('keeps start disabled until a task exists', async () => {
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
})

describe('History', () => {
  afterEach(() => {
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
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('restores saved tasks after mount without overwriting storage first', async () => {
    persistPomodoroState(
      makeState({
        selectedTaskId: 'task-1',
        tasks: [
          {
            id: 'task-1',
            name: 'Tarefa salva',
            createdAt: new Date('2026-01-01T10:00:00.000Z'),
          },
        ],
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
      ([key]) => key === STORAGE_KEY,
    )

    expect(persistedWrites.length).toBeGreaterThan(0)
    expect(JSON.parse(String(persistedWrites[0][1])).selectedTaskId).toBe(
      'task-1',
    )
    expect(localStorage.getItem(STORAGE_KEY)).toContain('Tarefa salva')
  })
})
