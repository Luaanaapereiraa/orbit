import type { ReactNode } from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PomodoroProvider, usePomodoro } from '../../contexts/PomodoroContext'
import { Home } from '../home/Home'
import { persistPomodoroState, STORAGE_KEY_DESTRAVAI } from '../../lib/storage'
import { makeCycle, makeDailyPlan, makeState, makeTask } from '../../test/factories'
import { TodayPage } from './TodayPage'

const navigation = vi.hoisted(() => ({
  pathname: '/',
  push: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}))

vi.mock('next/link', () => ({
  default({
    href,
    children,
    ...props
  }: {
    href: string
    children: ReactNode
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },
}))

const DATE_KEY = '2026-01-15'
const FIXED_NOW = new Date(2026, 0, 15, 12, 0, 0)

function storedState() {
  return JSON.parse(String(localStorage.getItem(STORAGE_KEY_DESTRAVAI))).state
}

function ForceThirdSecondary({
  dateKey,
  taskId,
}: {
  dateKey: string
  taskId: string
}) {
  const { addDailyPlanSecondary } = usePomodoro()

  return (
    <button type="button" onClick={() => addDailyPlanSecondary(dateKey, taskId)}>
      force-third
    </button>
  )
}

function renderToday(extra?: ReactNode) {
  return render(
    <PomodoroProvider>
      <TodayPage />
      {extra}
    </PomodoroProvider>,
  )
}

async function readyToday() {
  renderToday()
  expect(await screen.findByRole('heading', { name: 'Hoje' })).toBeInTheDocument()
}

describe('Today screen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(FIXED_NOW)
    navigation.pathname = '/'
    navigation.push.mockReset()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.useRealTimers()
  })

  describe('capture', () => {
    it('rejects an empty title', async () => {
      const user = userEvent.setup()
      await readyToday()

      const submit = screen.getByRole('button', { name: 'Capturar tarefa' })
      expect(submit).toBeDisabled()

      await user.click(submit)
      expect(screen.queryByText(/Capturado:/)).toBeNull()
    })

    it('creates an inbox task, clears the field, keeps focus and announces', async () => {
      const user = userEvent.setup()
      await readyToday()

      const input = screen.getByPlaceholderText('O que você precisa lembrar?')
      await user.type(input, '  Ligar para a clínica  ')
      await user.click(screen.getByRole('button', { name: 'Capturar tarefa' }))

      expect(input).toHaveValue('')
      expect(input).toHaveFocus()
      expect(screen.getByText('Capturado: Ligar para a clínica')).toBeInTheDocument()
      expect(
        screen.getAllByText('Ligar para a clínica').length,
      ).toBeGreaterThan(0)

      await waitFor(() => {
        const task = storedState().tasks.find(
          (item: { title: string }) => item.title === 'Ligar para a clínica',
        )
        expect(task.status).toBe('inbox')
        expect(storedState().dailyPlans).toEqual([])
      })
    })
  })

  describe('planning', () => {
    it('shows an open-day empty state', async () => {
      await readyToday()

      expect(screen.getByText('Seu dia ainda está aberto.')).toBeInTheDocument()
      expect(
        screen.getByText(
          'Escolha uma coisa essencial e, se quiser, até duas secundárias.',
        ),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Planejar meu dia' }),
      ).toBeInTheDocument()
    })

    it('plans an inbox task as essential with the same id', async () => {
      persistPomodoroState(
        makeState({
          tasks: [
            makeTask({
              id: 'inbox-1',
              title: 'Escrever o parágrafo',
              status: 'inbox',
            }),
          ],
        }),
      )
      const user = userEvent.setup()
      await readyToday()

      await user.click(screen.getByRole('button', { name: 'Planejar meu dia' }))
      await user.click(
        screen.getByRole('radio', { name: /Escrever o parágrafo/ }),
      )
      await user.click(screen.getByRole('button', { name: 'Confirmar plano' }))

      expect(await screen.findByText('Essencial')).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: 'Escrever o parágrafo' }),
      ).toBeInTheDocument()
      expect(
        screen.getByText('Nada por aqui. Capture o que estiver na cabeça.'),
      ).toBeInTheDocument()

      await waitFor(() => {
        const state = storedState()
        expect(state.tasks[0].id).toBe('inbox-1')
        expect(state.tasks[0].status).toBe('active')
        expect(state.dailyPlans[0].date).toBe(DATE_KEY)
        expect(state.dailyPlans[0].essentialTaskId).toBe('inbox-1')
      })
    })

    it('fills two secondaries and refuses a third', async () => {
      persistPomodoroState(
        makeState({
          tasks: [
            makeTask({ id: 'e1', title: 'Essencial', status: 'active' }),
            makeTask({
              id: 's1',
              title: 'Secundária um',
              status: 'active',
              position: 1,
            }),
            makeTask({
              id: 's2',
              title: 'Secundária dois',
              status: 'active',
              position: 2,
            }),
            makeTask({
              id: 's3',
              title: 'Terceira',
              status: 'inbox',
              position: 3,
            }),
          ],
          dailyPlans: [
            makeDailyPlan({
              date: DATE_KEY,
              essentialTaskId: 'e1',
              secondaryTaskIds: ['s1', 's2'],
            }),
          ],
        }),
      )
      const user = userEvent.setup()
      render(
        <PomodoroProvider>
          <TodayPage />
          <ForceThirdSecondary dateKey={DATE_KEY} taskId="s3" />
        </PomodoroProvider>,
      )
      expect(await screen.findByRole('heading', { name: 'Hoje' })).toBeInTheDocument()

      expect(screen.getByRole('heading', { name: 'Essencial' })).toBeTruthy()
      expect(screen.getByRole('heading', { name: 'Secundária um' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Secundária dois' })).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Adicionar como secundária' }),
      ).toBeNull()
      expect(screen.getByText('Terceira')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'force-third' }))
      await waitFor(() => {
        expect(storedState().dailyPlans[0].secondaryTaskIds).toEqual(['s1', 's2'])
      })
    })

    it('keeps done and archived tasks out of planner candidates', async () => {
      persistPomodoroState(
        makeState({
          tasks: [
            makeTask({ id: 'open', title: 'Aberta', status: 'active' }),
            makeTask({
              id: 'done',
              title: 'Já concluída',
              status: 'done',
              completedAt: '2026-01-15T11:00:00.000Z',
              position: 1,
            }),
            makeTask({
              id: 'archived',
              title: 'Já arquivada',
              status: 'archived',
              position: 2,
            }),
          ],
        }),
      )
      const user = userEvent.setup()
      await readyToday()

      await user.click(screen.getByRole('button', { name: 'Planejar meu dia' }))
      const dialog = screen.getByRole('dialog', { name: 'Planejar meu dia' })
      expect(within(dialog).getByRole('radio', { name: 'Aberta' })).toBeInTheDocument()
      expect(within(dialog).queryByText('Já concluída')).toBeNull()
      expect(within(dialog).queryByText('Já arquivada')).toBeNull()
    })

    it('removes a task from the plan without deleting it', async () => {
      persistPomodoroState(
        makeState({
          tasks: [makeTask({ id: 'keep', title: 'Continua ativa', status: 'active' })],
          dailyPlans: [
            makeDailyPlan({ date: DATE_KEY, essentialTaskId: 'keep' }),
          ],
        }),
      )
      const user = userEvent.setup()
      await readyToday()

      await user.click(
        screen.getByRole('button', { name: 'Mais ações para Continua ativa' }),
      )
      await user.click(screen.getByRole('menuitem', { name: 'Remover do plano' }))

      expect(await screen.findByText('Seu dia ainda está aberto.')).toBeInTheDocument()
      await waitFor(() => {
        const state = storedState()
        expect(state.tasks[0].id).toBe('keep')
        expect(state.tasks[0].status).toBe('active')
        expect(state.dailyPlans[0].essentialTaskId).toBeNull()
      })
    })
  })

  describe('completion', () => {
    it('keeps a completed essential in place, without remove or archive', async () => {
      persistPomodoroState(
        makeState({
          tasks: [makeTask({ id: 'focus-me', title: 'Revisar o texto', status: 'active' })],
          dailyPlans: [
            makeDailyPlan({ date: DATE_KEY, essentialTaskId: 'focus-me' }),
          ],
        }),
      )
      const user = userEvent.setup()
      await readyToday()

      await user.click(screen.getByRole('button', { name: 'Concluir' }))

      expect(await screen.findByText('Concluída')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Revisar o texto' })).toBeInTheDocument()
      expect(
        screen.getByText('Concluída: Revisar o texto. Ela permanece no seu plano de hoje.'),
      ).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Concluir' })).toBeNull()

      await user.click(
        screen.getByRole('button', { name: 'Mais ações para Revisar o texto' }),
      )
      expect(screen.queryByRole('menuitem', { name: 'Remover do plano' })).toBeNull()
      expect(screen.queryByRole('menuitem', { name: 'Arquivar' })).toBeNull()

      await waitFor(() => {
        expect(storedState().tasks[0].status).toBe('done')
        expect(storedState().dailyPlans[0].essentialTaskId).toBe('focus-me')
      })
    })

    it('reopens a completed task in the same plan slot and survives refresh', async () => {
      persistPomodoroState(
        makeState({
          tasks: [
            makeTask({
              id: 'focus-me',
              title: 'Revisar o texto',
              status: 'done',
              completedAt: '2026-01-15T11:00:00.000Z',
            }),
          ],
          dailyPlans: [
            makeDailyPlan({ date: DATE_KEY, essentialTaskId: 'focus-me' }),
          ],
        }),
      )
      const user = userEvent.setup()
      const { unmount } = renderToday()
      expect(await screen.findByText('Concluída')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Reabrir' }))
      expect(await screen.findByRole('button', { name: 'Iniciar foco' })).toBeInTheDocument()
      expect(screen.getByText('Essencial')).toBeInTheDocument()

      await waitFor(() => {
        expect(storedState().tasks[0].status).toBe('active')
      })

      unmount()
      renderToday()
      expect(await screen.findByRole('heading', { name: 'Revisar o texto' })).toBeInTheDocument()
      expect(screen.getByText('Essencial')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Iniciar foco' })).toBeInTheDocument()
    })
  })

  describe('editing', () => {
    it('saves title, next action, energy and estimate', async () => {
      persistPomodoroState(
        makeState({
          tasks: [makeTask({ id: 'edit-me', title: 'Rascunho', status: 'active' })],
          dailyPlans: [
            makeDailyPlan({ date: DATE_KEY, essentialTaskId: 'edit-me' }),
          ],
        }),
      )
      const user = userEvent.setup()
      await readyToday()

      await user.click(screen.getByRole('button', { name: 'Mais ações para Rascunho' }))
      await user.click(screen.getByRole('menuitem', { name: 'Editar' }))

      const dialog = screen.getByRole('dialog', { name: 'Editar tarefa' })
      const title = within(dialog).getByLabelText('Título')
      await user.clear(title)
      await user.type(title, 'Capítulo 1')
      await user.type(
        within(dialog).getByLabelText('Qual é o menor passo concreto para começar?'),
        'Abrir o documento e escrever o primeiro parágrafo.',
      )
      await user.click(within(dialog).getByLabelText('Exige energia'))
      await user.click(within(dialog).getByLabelText('Preset'))
      await user.selectOptions(
        within(dialog).getByLabelText('Minutos estimados'),
        '45',
      )
      await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

      expect(await screen.findByRole('heading', { name: 'Capítulo 1' })).toBeInTheDocument()
      expect(
        screen.getByText('Abrir o documento e escrever o primeiro parágrafo.'),
      ).toBeInTheDocument()
      expect(screen.getByText('Energia: Exige energia')).toBeInTheDocument()
      expect(screen.getByText('Cerca de 45 min')).toBeInTheDocument()
    })

    it('does not save on cancel and rejects an empty title', async () => {
      persistPomodoroState(
        makeState({
          tasks: [makeTask({ id: 'edit-me', title: 'Rascunho', status: 'inbox' })],
        }),
      )
      const user = userEvent.setup()
      await readyToday()

      await user.click(screen.getByRole('button', { name: 'Editar' }))
      const dialog = screen.getByRole('dialog', { name: 'Editar tarefa' })
      await user.clear(within(dialog).getByLabelText('Título'))
      await user.type(within(dialog).getByLabelText('Título'), 'Não deve ficar')
      await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

      expect(screen.getByText('Rascunho')).toBeInTheDocument()
      expect(screen.queryByText('Não deve ficar')).toBeNull()

      await user.click(screen.getByRole('button', { name: 'Editar' }))
      const again = screen.getByRole('dialog', { name: 'Editar tarefa' })
      await user.clear(within(again).getByLabelText('Título'))
      await user.click(within(again).getByRole('button', { name: 'Salvar' }))
      expect(within(again).getByRole('alert')).toHaveTextContent(
        'Dê um nome para esta tarefa.',
      )
    })
  })

  describe('focus', () => {
    it('starts a focus cycle in one event, snapshots the title and navigates', async () => {
      persistPomodoroState(
        makeState({
          tasks: [makeTask({ id: 'task-focus', title: 'Estudar testes', status: 'active' })],
          dailyPlans: [
            makeDailyPlan({ date: DATE_KEY, essentialTaskId: 'task-focus' }),
          ],
        }),
      )
      const user = userEvent.setup()
      await readyToday()

      await user.click(screen.getByRole('button', { name: 'Iniciar foco' }))

      expect(navigation.push).toHaveBeenCalledWith('/focus')
      await waitFor(() => {
        const cycle = storedState().cycles[0]
        expect(cycle.task).toBe('Estudar testes')
        expect(cycle.taskId).toBe('task-focus')
        expect(cycle.type).toBe('focus')
        expect(storedState().activeCycleId).toBe(cycle.id)
      })
    })

    it('does not start a second cycle when one is already active', async () => {
      persistPomodoroState(
        makeState({
          selectedTaskId: 'task-focus',
          tasks: [
            makeTask({ id: 'task-focus', title: 'Estudar testes', status: 'active' }),
            makeTask({
              id: 'other',
              title: 'Outra',
              status: 'active',
              position: 1,
            }),
          ],
          dailyPlans: [
            makeDailyPlan({
              date: DATE_KEY,
              essentialTaskId: 'task-focus',
              secondaryTaskIds: ['other'],
            }),
          ],
          cycles: [
            makeCycle({
              id: 'cycle-1',
              task: 'Estudar testes',
              taskId: 'task-focus',
              startDate: new Date(2026, 0, 15, 11, 55, 0),
            }),
          ],
          activeCycleId: 'cycle-1',
        }),
      )
      const user = userEvent.setup()
      await readyToday()

      expect(screen.getByRole('link', { name: 'Voltar ao foco' })).toHaveAttribute(
        'href',
        '/focus',
      )
      await user.click(screen.getAllByRole('button', { name: 'Voltar ao foco' })[0])
      expect(navigation.push).toHaveBeenCalledWith('/focus')
      await waitFor(() => {
        expect(storedState().cycles).toHaveLength(1)
        expect(storedState().activeCycleId).toBe('cycle-1')
      })
    })

    it('does not reset the running timer when the Today view unmounts', async () => {
      persistPomodoroState(
        makeState({
          tasks: [makeTask({ id: 'task-focus', title: 'Estudar testes', status: 'active' })],
          dailyPlans: [
            makeDailyPlan({ date: DATE_KEY, essentialTaskId: 'task-focus' }),
          ],
        }),
      )

      function Shell({ view }: { view: 'today' | 'focus' }) {
        return (
          <PomodoroProvider>
            {view === 'today' ? <TodayPage /> : <Home />}
          </PomodoroProvider>
        )
      }

      const user = userEvent.setup()
      const { rerender } = render(<Shell view="today" />)
      expect(await screen.findByRole('heading', { name: 'Hoje' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Iniciar foco' }))

      rerender(<Shell view="focus" />)
      expect(await screen.findByRole('button', { name: /pausar/i })).toBeInTheDocument()
      expect(screen.getAllByText('Estudar testes').length).toBeGreaterThan(0)
    })
  })

  describe('inbox', () => {
    it('shows a compact list, expands, moves to active and archives with confirmation', async () => {
      persistPomodoroState(
        makeState({
          tasks: [
            makeTask({ id: 'i1', title: 'Um', status: 'inbox', position: 0 }),
            makeTask({ id: 'i2', title: 'Dois', status: 'inbox', position: 1 }),
            makeTask({ id: 'i3', title: 'Três', status: 'inbox', position: 2 }),
            makeTask({ id: 'i4', title: 'Quatro', status: 'inbox', position: 3 }),
          ],
        }),
      )
      const user = userEvent.setup()
      await readyToday()

      expect(screen.getByText('4 itens para organizar quando fizer sentido.')).toBeInTheDocument()
      expect(screen.getByText('Um')).toBeInTheDocument()
      expect(screen.queryByText('Quatro')).toBeNull()

      await user.click(screen.getByRole('button', { name: 'Ver todas (4)' }))
      expect(screen.getByText('Quatro')).toBeInTheDocument()

      await user.click(screen.getAllByRole('button', { name: 'Mover para ativas' })[0])
      await waitFor(() => {
        expect(storedState().tasks.find((task: { id: string }) => task.id === 'i1').status).toBe(
          'active',
        )
      })

      await user.click(screen.getAllByRole('button', { name: 'Arquivar' })[0])
      const archiveDialog = screen.getByRole('dialog', { name: 'Arquivar tarefa?' })
      expect(archiveDialog).toBeInTheDocument()
      await user.click(within(archiveDialog).getByRole('button', { name: 'Arquivar' }))
      await waitFor(() => {
        expect(
          storedState().tasks.some((task: { status: string }) => task.status === 'archived'),
        ).toBe(true)
      })
    })

    it('moves a planned inbox item out of the inbox', async () => {
      persistPomodoroState(
        makeState({
          tasks: [makeTask({ id: 'inbox-1', title: 'Entrada', status: 'inbox' })],
        }),
      )
      const user = userEvent.setup()
      await readyToday()

      await user.click(screen.getByRole('button', { name: 'Tornar essencial' }))
      expect(await screen.findByText('Essencial')).toBeInTheDocument()
      expect(screen.getByText('Nada por aqui. Capture o que estiver na cabeça.')).toBeInTheDocument()
      await waitFor(() => {
        expect(storedState().tasks[0].status).toBe('active')
        expect(storedState().dailyPlans[0].essentialTaskId).toBe('inbox-1')
      })
    })
  })
})
