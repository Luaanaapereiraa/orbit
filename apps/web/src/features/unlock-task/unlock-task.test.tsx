import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  UnlockTaskRunRequest,
  UnlockTaskRunResponse,
} from '@destravai/contracts'
import type { AuthClient } from '../../lib/auth/types'
import { AuthProvider } from '../../contexts/AuthContext'
import { PomodoroProvider } from '../../contexts/PomodoroContext'
import { persistPomodoroState, STORAGE_KEY_DESTRAVAI } from '../../lib/storage'
import { toLocalDateKey } from '../../lib/local-date'
import { makeDailyPlan, makeState, makeTask } from '../../test/factories'
import { UnlockTaskDialog } from './UnlockTaskDialog'
import { TodayPage } from '../today/TodayPage'

const navigation = vi.hoisted(() => ({
  pathname: '/',
  push: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}))

const completed: UnlockTaskRunResponse = {
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

function session() {
  return {
    accessToken: 'user-jwt',
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'luana@example.com',
    isAnonymous: false,
  }
}

function todayDateKey() {
  const date = toLocalDateKey()
  if (!date) {
    throw new Error('expected a local date key')
  }
  return date
}

const authClient: AuthClient = {
  async getSession() {
    return null
  },
  async signIn() {
    throw new Error('E-mail ou senha inválidos.')
  },
  async signUp() {
    throw new Error('Não foi possível criar a conta.')
  },
  async signOut() {
    return undefined
  },
  onAuthStateChange() {
    return () => undefined
  },
}

function storedTasks() {
  return JSON.parse(String(localStorage.getItem(STORAGE_KEY_DESTRAVAI))).state
    .tasks as Array<{
    id: string
    title: string
    nextAction: string | null
    energy: string | null
    estimatedMinutes: number | null
  }>
}

describe('Estou travada flow', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
    navigation.push.mockReset()
  })

  it('asks the person to sign in before calling the agent', async () => {
    const requestUnlock = vi.fn()
    const user = userEvent.setup()
    const task = makeTask({ title: 'Escrever o parágrafo' })

    render(
      <AuthProvider skipBootstrap client={authClient}>
        <PomodoroProvider>
          <UnlockTaskDialog
            task={task}
            onClose={() => undefined}
            requestUnlock={requestUnlock}
          />
        </PomodoroProvider>
      </AuthProvider>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Entre para pedir ajuda' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pedir ajuda' })).toBeNull()
    expect(requestUnlock).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('E-mail'), 'a@b.c')
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled()
  })

  it('requests a plan, does not auto-apply, then applies only after confirmation', async () => {
    persistPomodoroState(
      makeState({
        tasks: [
          makeTask({
            id: 'task-1',
            title: 'Escrever o parágrafo',
            nextAction: null,
            energy: null,
            estimatedMinutes: null,
          }),
        ],
        dailyPlans: [
          makeDailyPlan({
            date: todayDateKey(),
            essentialTaskId: 'task-1',
          }),
        ],
      }),
    )

    const requestUnlock = vi.fn(
      async (body: UnlockTaskRunRequest, token: string) => {
        expect(token).toBe('user-jwt')
        expect(body.task.title).toBe('Escrever o parágrafo')
        expect(body.today.role).toBe('essential')
        return completed
      },
    )
    const user = userEvent.setup()

    render(
      <AuthProvider
        skipBootstrap
        client={authClient}
        initialSession={session()}
      >
        <PomodoroProvider>
          <UnlockTaskDialog
            task={makeTask({
              id: 'task-1',
              title: 'Escrever o parágrafo',
            })}
            onClose={() => undefined}
            requestUnlock={requestUnlock}
          />
        </PomodoroProvider>
      </AuthProvider>,
    )

    expect(
      await screen.findByRole('button', { name: 'Pedir ajuda' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pedir ajuda' }))

    expect(
      await screen.findByText(/Isto é uma sugestão para/),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Abrir o arquivo e escrever o titulo'),
    ).toBeInTheDocument()

    await waitFor(() => {
      const task = storedTasks().find((item) => item.id === 'task-1')
      expect(task?.nextAction).toBeNull()
      expect(task?.title).toBe('Escrever o parágrafo')
    })

    await user.click(screen.getByRole('button', { name: 'Aplicar à tarefa' }))
    await user.click(screen.getByRole('button', { name: 'Sim, aplicar' }))

    await waitFor(() => {
      const task = storedTasks().find((item) => item.id === 'task-1')
      expect(task?.title).toBe('Escrever o parágrafo')
      expect(task?.nextAction).toBe('Abrir o arquivo e escrever o titulo')
      expect(task?.energy).toBe('medium')
      expect(task?.estimatedMinutes).toBe(20)
    })
  })

  it('can start focus from the suggestion without applying it', async () => {
    persistPomodoroState(
      makeState({
        tasks: [makeTask({ id: 'task-1', title: 'Escrever o parágrafo' })],
      }),
    )
    const requestUnlock = vi.fn(async () => completed)
    const user = userEvent.setup()

    render(
      <AuthProvider
        skipBootstrap
        client={authClient}
        initialSession={session()}
      >
        <PomodoroProvider>
          <UnlockTaskDialog
            task={makeTask({ id: 'task-1', title: 'Escrever o parágrafo' })}
            onClose={() => undefined}
            requestUnlock={requestUnlock}
          />
        </PomodoroProvider>
      </AuthProvider>,
    )

    await user.click(await screen.findByRole('button', { name: 'Pedir ajuda' }))
    await user.click(
      await screen.findByRole('button', { name: 'Iniciar foco' }),
    )

    expect(navigation.push).toHaveBeenCalledWith('/focus')
    await waitFor(() => {
      const task = storedTasks().find((item) => item.id === 'task-1')
      expect(task?.nextAction).toBeNull()
    })
  })

  it('shows Estou travada on a planned task without applying anything by itself', async () => {
    persistPomodoroState(
      makeState({
        tasks: [makeTask({ id: 'task-1', title: 'Escrever o parágrafo' })],
        dailyPlans: [
          makeDailyPlan({
            date: todayDateKey(),
            essentialTaskId: 'task-1',
          }),
        ],
      }),
    )

    render(
      <AuthProvider
        skipBootstrap
        client={authClient}
        initialSession={session()}
      >
        <PomodoroProvider>
          <TodayPage />
        </PomodoroProvider>
      </AuthProvider>,
    )

    expect(
      await screen.findByRole('button', { name: 'Estou travada' }),
    ).toBeInTheDocument()
    await waitFor(() => {
      const task = storedTasks().find((item) => item.id === 'task-1')
      expect(task?.nextAction).toBeNull()
    })
  })
})
