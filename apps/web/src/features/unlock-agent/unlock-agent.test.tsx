import type { ReactNode } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  UnlockTaskRunRequest,
  UnlockTaskRunResponse,
} from '@destravai/contracts'
import type { AuthClient, Session } from '../../lib/auth/types'
import { AuthProvider } from '../../contexts/AuthContext'
import { PomodoroProvider } from '../../contexts/PomodoroContext'
import { persistPomodoroState, STORAGE_KEY_DESTRAVAI } from '../../lib/storage'
import { toLocalDateKey } from '../../lib/local-date'
import { makeDailyPlan, makeState, makeTask } from '../../test/factories'
import { TodayPage } from '../today/TodayPage'
import { UnlockTaskDialog } from './components/UnlockTaskDialog'

const navigation = vi.hoisted(() => ({
  pathname: '/',
  push: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}))

vi.mock('next/link', () => ({
  default({ href, children, ...props }: { href: string; children: ReactNode }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },
}))

const completed = (
  mode: 'agent' | 'fallback' = 'agent',
): UnlockTaskRunResponse => ({
  status: 'completed',
  runId: '550e8400-e29b-41d4-a716-446655440099',
  promptVersion: 'unlock-v1',
  generationMode: mode,
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
})

function session(): Session {
  return {
    accessToken: 'user-jwt',
    user: { id: 'user-1', email: 'a@b.c' },
  }
}

const authClient: AuthClient = {
  async getSession() {
    return session()
  },
  async signInWithEmail() {
    return undefined
  },
  async signOut() {
    return undefined
  },
  async getAccessToken() {
    return 'user-jwt'
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
    status: string
  }>
}

function persistTodayTask() {
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
          date: toLocalDateKey() ?? '2026-08-29',
          essentialTaskId: 'task-1',
        }),
      ],
    }),
  )
}

function renderDialog(
  run: (
    body: UnlockTaskRunRequest,
    token: string,
  ) => Promise<UnlockTaskRunResponse>,
  preferredTaskId: string | null = 'task-1',
) {
  return render(
    <AuthProvider skipBootstrap client={authClient} initialSession={session()}>
      <PomodoroProvider>
        <UnlockTaskDialog
          open
          preferredTaskId={preferredTaskId}
          onClose={() => undefined}
          run={run}
        />
      </PomodoroProvider>
    </AuthProvider>,
  )
}

describe('Estou travada flow', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
    navigation.push.mockReset()
  })

  it('asks for login without sending the task', async () => {
    persistTodayTask()
    const run = vi.fn()
    const user = userEvent.setup()

    render(
      <AuthProvider skipBootstrap client={authClient} initialSession={null}>
        <PomodoroProvider>
          <TodayPage />
        </PomodoroProvider>
      </AuthProvider>,
    )

    await user.click(
      (
        await screen.findAllByRole('button', { name: 'Estou travada' })
      )[0],
    )
    expect(
      await screen.findByRole('button', { name: 'Entrar para usar o agente' }),
    ).toBeInTheDocument()
    expect(run).not.toHaveBeenCalled()
  })

  it('requests a plan, does not auto-apply, then applies only after confirmation', async () => {
    persistTodayTask()
    const run = vi.fn(async (body: UnlockTaskRunRequest, token: string) => {
      expect(token).toBe('user-jwt')
      expect(body.task.title).toBe('Escrever o parágrafo')
      expect(body.today.role).toBe('essential')
      return completed()
    })
    const user = userEvent.setup()
    renderDialog(run)

    await user.click(
      await screen.findByRole('button', { name: 'Criar meu próximo passo' }),
    )
    expect(
      await screen.findByText(/Isto é uma sugestão para/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Abrir o arquivo e escrever o titulo/),
    ).toBeInTheDocument()

    await waitFor(() => {
      const task = storedTasks().find((item) => item.id === 'task-1')
      expect(task?.nextAction).toBeNull()
      expect(task?.title).toBe('Escrever o parágrafo')
    })

    await user.click(screen.getByRole('button', { name: 'Usar este plano' }))
    await user.click(
      screen.getAllByRole('button', { name: 'Usar este plano' })[1],
    )

    await waitFor(() => {
      const task = storedTasks().find((item) => item.id === 'task-1')
      expect(task?.title).toBe('Escrever o parágrafo')
      expect(task?.nextAction).toBe('Abrir o arquivo e escrever o titulo')
      expect(task?.energy).toBe('medium')
      expect(task?.estimatedMinutes).toBe(20)
      expect(task?.status).toBe('active')
    })
  })

  it('shows a discreet fallback label and starts focus only after applying', async () => {
    persistTodayTask()
    const run = vi.fn(async () => completed('fallback'))
    const user = userEvent.setup()
    renderDialog(run)

    await user.click(
      await screen.findByRole('button', { name: 'Criar meu próximo passo' }),
    )
    expect(
      await screen.findByText(
        'Plano rápido gerado enquanto o assistente estava indisponível.',
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Começar foco' }))
    const confirmButtons = screen.getAllByRole('button', {
      name: 'Usar este plano',
    })
    await user.click(confirmButtons[confirmButtons.length - 1])

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith('/focus')
      const task = storedTasks().find((item) => item.id === 'task-1')
      expect(task?.nextAction).toBe('Abrir o arquivo e escrever o titulo')
    })
  })

  it('sends a new clientRequestId after clarification', async () => {
    persistTodayTask()
    const ids: string[] = []
    const run = vi.fn(async (body: UnlockTaskRunRequest) => {
      ids.push(body.clientRequestId)
      if (ids.length === 1) {
        return {
          status: 'needs_clarification',
          runId: '550e8400-e29b-41d4-a716-446655440088',
          promptVersion: 'unlock-v1',
          createdAt: '2026-08-28T18:00:00.000Z',
          question: 'Qual arquivo você quer abrir primeiro?',
        } satisfies UnlockTaskRunResponse
      }
      return completed()
    })
    const user = userEvent.setup()
    renderDialog(run)

    await user.click(
      await screen.findByRole('button', { name: 'Criar meu próximo passo' }),
    )
    expect(
      await screen.findByText('Qual arquivo você quer abrir primeiro?'),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText('Sua resposta'), 'O rascunho')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(
      await screen.findByText(/Isto é uma sugestão para/),
    ).toBeInTheDocument()
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('reuses the same id after a network error', async () => {
    persistTodayTask()
    const ids: string[] = []
    let fail = true
    const run = vi.fn(async (body: UnlockTaskRunRequest) => {
      ids.push(body.clientRequestId)
      if (fail) {
        fail = false
        throw new TypeError('Failed to fetch')
      }
      return completed()
    })
    const user = userEvent.setup()
    renderDialog(run)

    await user.click(
      await screen.findByRole('button', { name: 'Criar meu próximo passo' }),
    )
    expect(
      await screen.findByRole('button', { name: 'Consultar de novo' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Consultar de novo' }))
    expect(
      await screen.findByText(/Isto é uma sugestão para/),
    ).toBeInTheDocument()
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1])
  })

  it('does not interrupt an active cycle', async () => {
    persistPomodoroState(
      makeState({
        tasks: [makeTask({ id: 'task-1', title: 'Escrever o parágrafo' })],
        cycles: [
          {
            id: 'cycle-1',
            type: 'focus',
            task: 'Outra',
            taskId: 'other',
            minutesAmount: 25,
            startDate: new Date('2026-08-29T12:00:00.000Z'),
            pausedMs: 0,
          },
        ],
        activeCycleId: 'cycle-1',
      }),
    )
    const run = vi.fn(async () => completed())
    const user = userEvent.setup()
    renderDialog(run)

    await user.click(
      await screen.findByRole('button', { name: 'Criar meu próximo passo' }),
    )
    await user.click(
      await screen.findByRole('button', { name: 'Começar foco' }),
    )
    expect(
      await screen.findByText(/Já existe um ciclo em andamento/),
    ).toBeInTheDocument()
    expect(navigation.push).not.toHaveBeenCalled()
  })
})
