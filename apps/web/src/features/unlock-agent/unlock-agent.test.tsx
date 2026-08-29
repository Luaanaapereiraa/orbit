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
import { PomodoroProvider, usePomodoro } from '../../contexts/PomodoroContext'
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
    await user.click(screen.getByRole('button', { name: 'Usar este plano' }))

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
    await user.click(screen.getByRole('button', { name: 'Usar este plano' }))

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

function persistTwoTasks() {
  persistPomodoroState(
    makeState({
      tasks: [
        makeTask({
          id: 'task-a',
          title: 'Escrever o parágrafo',
          nextAction: null,
          energy: null,
          estimatedMinutes: null,
        }),
        makeTask({
          id: 'task-b',
          title: 'Escrever o parágrafo',
          nextAction: null,
          energy: null,
          estimatedMinutes: null,
          position: 1,
        }),
      ],
      dailyPlans: [
        makeDailyPlan({
          date: toLocalDateKey() ?? '2026-08-29',
          essentialTaskId: 'task-a',
          secondaryTaskIds: ['task-b'],
        }),
      ],
    }),
  )
}

function DialogHarness({
  run,
}: {
  run: (
    body: UnlockTaskRunRequest,
    token: string,
  ) => Promise<UnlockTaskRunResponse>
}) {
  const { completeTask, deleteTask, archiveTask } = usePomodoro()
  return (
    <>
      <UnlockTaskDialog
        open
        preferredTaskId="task-a"
        onClose={() => undefined}
        run={run}
      />
      <button type="button" onClick={() => completeTask('task-a')}>
        complete-a
      </button>
      <button type="button" onClick={() => deleteTask('task-a')}>
        delete-a
      </button>
      <button type="button" onClick={() => archiveTask('task-a')}>
        archive-a
      </button>
    </>
  )
}

function renderHarness(
  run: (
    body: UnlockTaskRunRequest,
    token: string,
  ) => Promise<UnlockTaskRunResponse>,
) {
  return render(
    <AuthProvider skipBootstrap client={authClient} initialSession={session()}>
      <PomodoroProvider>
        <DialogHarness run={run} />
      </PomodoroProvider>
    </AuthProvider>,
  )
}

describe('Estou travada apply identity', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
    navigation.push.mockReset()
  })

  it('never applies a plan created for A onto B', async () => {
    persistTwoTasks()
    const run = vi.fn(async () => completed())
    const user = userEvent.setup()
    renderHarness(run)

    await user.click(
      await screen.findByRole('button', { name: 'Criar meu próximo passo' }),
    )
    expect(
      await screen.findByText(/Isto é uma sugestão para/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Usar este plano' }))
    await user.click(screen.getByRole('button', { name: 'complete-a' }))
    await user.click(screen.getByRole('button', { name: 'Usar este plano' }))

    expect(
      await screen.findByText(
        'Esta tarefa mudou enquanto o plano era criado. O plano não foi aplicado.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Plano aplicado à tarefa.'),
    ).not.toBeInTheDocument()

    const stored = storedTasks()
    expect(stored.find((item) => item.id === 'task-a')?.status).toBe('done')
    expect(stored.find((item) => item.id === 'task-b')?.nextAction).toBeNull()
    const plan = JSON.parse(String(localStorage.getItem(STORAGE_KEY_DESTRAVAI)))
      .state.dailyPlans[0]
    expect(plan.essentialTaskId).toBe('task-a')
    expect(plan.secondaryTaskIds).toEqual(['task-b'])
  })

  it('does not apply when A is deleted and does not start focus', async () => {
    persistTwoTasks()
    const run = vi.fn(async () => completed())
    const user = userEvent.setup()
    renderHarness(run)

    await user.click(
      await screen.findByRole('button', { name: 'Criar meu próximo passo' }),
    )
    await screen.findByText(/Isto é uma sugestão para/)
    await user.click(screen.getByRole('button', { name: 'Começar foco' }))
    await user.click(screen.getByRole('button', { name: 'delete-a' }))
    await user.click(screen.getByRole('button', { name: 'Usar este plano' }))

    expect(
      await screen.findByText(
        'Esta tarefa mudou enquanto o plano era criado. O plano não foi aplicado.',
      ),
    ).toBeInTheDocument()
    expect(navigation.push).not.toHaveBeenCalled()
    expect(
      storedTasks().find((item) => item.id === 'task-b')?.nextAction,
    ).toBeNull()
    const cycles = JSON.parse(
      String(localStorage.getItem(STORAGE_KEY_DESTRAVAI)),
    ).state.cycles
    expect(cycles).toEqual([])
  })

  it('does not apply when A is archived', async () => {
    persistTwoTasks()
    const run = vi.fn(async () => completed())
    const user = userEvent.setup()
    renderHarness(run)

    await user.click(
      await screen.findByRole('button', { name: 'Criar meu próximo passo' }),
    )
    await screen.findByText(/Isto é uma sugestão para/)
    await user.click(screen.getByRole('button', { name: 'Usar este plano' }))
    await user.click(screen.getByRole('button', { name: 'archive-a' }))
    await user.click(screen.getByRole('button', { name: 'Usar este plano' }))

    expect(
      await screen.findByText(
        'Esta tarefa mudou enquanto o plano era criado. O plano não foi aplicado.',
      ),
    ).toBeInTheDocument()
    expect(
      storedTasks().find((item) => item.id === 'task-b')?.nextAction,
    ).toBeNull()
  })

  it('applies only to A when A stays eligible', async () => {
    persistTwoTasks()
    const run = vi.fn(async () => completed())
    const user = userEvent.setup()
    renderHarness(run)

    await user.click(
      await screen.findByRole('button', { name: 'Criar meu próximo passo' }),
    )
    await user.click(
      await screen.findByRole('button', { name: 'Usar este plano' }),
    )
    await user.click(screen.getByRole('button', { name: 'Usar este plano' }))

    await waitFor(() => {
      const stored = storedTasks()
      expect(stored.find((item) => item.id === 'task-a')?.nextAction).toBe(
        'Abrir o arquivo e escrever o titulo',
      )
      expect(stored.find((item) => item.id === 'task-b')?.nextAction).toBeNull()
    })
    expect(screen.getByText('Plano aplicado à tarefa.')).toBeInTheDocument()
    const plan = JSON.parse(String(localStorage.getItem(STORAGE_KEY_DESTRAVAI)))
      .state.dailyPlans[0]
    expect(plan.essentialTaskId).toBe('task-a')
  })

  it('returns to the form on 400 and keeps the typed values', async () => {
    persistTodayTask()
    const { UnlockAgentError } = await import('./api/unlock-agent-errors')
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
    const user = userEvent.setup()
    renderDialog(run)

    await user.type(
      screen.getByLabelText('Detalhes (opcional)'),
      'texto antigo',
    )
    await user.click(
      screen.getByRole('button', { name: 'Criar meu próximo passo' }),
    )

    expect(
      await screen.findByText(
        'Alguns dados do pedido não são válidos. Revise o formulário.',
      ),
    ).toBeInTheDocument()
    const details = document.getElementById('unlock-details')
    expect(details).toHaveValue('texto antigo')
    expect(screen.getByText('Detalhe inválido')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Criar meu próximo passo' }),
    ).toBeInTheDocument()
    expect(document.activeElement).toBe(details)
  })

  it('disables 409 retry until the cooldown ends', async () => {
    persistTodayTask()
    const { UnlockAgentError } = await import('./api/unlock-agent-errors')
    let current = 1_000
    const run = vi.fn(async () => {
      throw new UnlockAgentError(
        'in_progress',
        'Esta solicitação ainda está sendo processada. Você pode consultar de novo o mesmo pedido.',
        { status: 409, retryable: true, sameRequest: true },
      )
    })
    const user = userEvent.setup()
    render(
      <AuthProvider
        skipBootstrap
        client={authClient}
        initialSession={session()}
      >
        <PomodoroProvider>
          <UnlockTaskDialog
            open
            preferredTaskId="task-1"
            onClose={() => undefined}
            run={run}
            now={() => current}
          />
        </PomodoroProvider>
      </AuthProvider>,
    )

    await user.click(
      await screen.findByRole('button', { name: 'Criar meu próximo passo' }),
    )
    const retry = await screen.findByRole('button', {
      name: 'Consultar de novo',
    })
    expect(retry).toBeDisabled()
    expect(screen.getByText(/Aguarde 2s/)).toBeInTheDocument()

    current = 3_000
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Consultar de novo' }),
      ).not.toBeDisabled()
    })
    await user.click(screen.getByRole('button', { name: 'Consultar de novo' }))
    expect(run).toHaveBeenCalledTimes(2)
    const firstBody = run.mock.calls.at(0)?.at(0) as
      | UnlockTaskRunRequest
      | undefined
    const secondBody = run.mock.calls.at(1)?.at(0) as
      | UnlockTaskRunRequest
      | undefined
    expect(firstBody?.clientRequestId).toBe(secondBody?.clientRequestId)
  })

  it('focuses the first useful control and keeps a single dialog', async () => {
    persistTodayTask()
    const user = userEvent.setup()
    renderDialog(vi.fn(async () => completed()))

    expect(document.querySelectorAll('dialog')).toHaveLength(1)
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('combobox'))
    })

    await user.click(
      screen.getByRole('button', { name: 'Criar meu próximo passo' }),
    )
    await user.click(
      await screen.findByRole('button', { name: 'Usar este plano' }),
    )

    expect(document.querySelectorAll('dialog')).toHaveLength(1)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Usar este plano' }),
      ).toHaveFocus()
    })

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Começar foco' }),
      ).toBeInTheDocument()
    })
  })
})
