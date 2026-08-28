import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  STORAGE_KEY,
  STORAGE_KEY_DESTRAVAI,
  STORAGE_KEY_V1,
  applyThemeClass,
  loadPomodoroState,
  persistPomodoroState,
} from '../lib/storage'
import { initialPomodoroState } from '@destravai/core'
import { makeCycle, makeState, makeTask } from '../test/factories'

const NOW = '2026-01-01T12:00:00.000Z'

function v2LegacyState() {
  return {
    cycles: [
      {
        id: 'cycle-keep',
        type: 'focus',
        task: 'Escrever testes',
        taskId: 'task-1',
        minutesAmount: 25,
        startDate: '2026-01-01T10:00:00.000Z',
        pausedMs: 0,
      },
    ],
    activeCycleId: 'cycle-keep',
    selectedTaskId: 'task-1',
    tasks: [
      {
        id: 'task-1',
        name: 'Escrever testes',
        createdAt: '2026-01-01T09:00:00.000Z',
      },
    ],
    settings: {
      ...initialPomodoroState.settings,
      focusMinutes: 40,
    },
  }
}

describe('storage', () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    vi.restoreAllMocks()
  })

  it('returns the initial state when nothing is stored', () => {
    expect(loadPomodoroState()).toEqual(initialPomodoroState)
    expect(loadPomodoroState().dailyPlans).toEqual([])
  })

  it('returns the initial state when storage is unavailable', () => {
    expect(loadPomodoroState(null)).toEqual(initialPomodoroState)
  })

  it('does not write when storage is unavailable', () => {
    expect(() => persistPomodoroState(makeState(), null)).not.toThrow()
    expect(localStorage.getItem(STORAGE_KEY_DESTRAVAI)).toBeNull()
  })

  it('persists the DestravAI envelope and reloads it', () => {
    persistPomodoroState(
      makeState({
        selectedTaskId: 'task-1',
        tasks: [makeTask({ id: 'task-1', title: 'Tarefa salva' })],
        settings: {
          ...initialPomodoroState.settings,
          focusMinutes: 40,
        },
      }),
    )

    const raw = localStorage.getItem(STORAGE_KEY_DESTRAVAI)
    expect(raw).toBeTruthy()
    expect(JSON.parse(String(raw)).version).toBe(1)

    const loaded = loadPomodoroState()

    expect(loaded.selectedTaskId).toBe('task-1')
    expect(loaded.tasks[0].title).toBe('Tarefa salva')
    expect(loaded.settings.focusMinutes).toBe(40)
    expect(loaded.settings.shortBreakMinutes).toBe(5)
    expect(loaded.dailyPlans).toEqual([])
  })

  it('migrates the current pomodorodev v2 format', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v2LegacyState()))

    const loaded = loadPomodoroState(localStorage, NOW)

    expect(loaded.tasks[0]).toMatchObject({
      id: 'task-1',
      title: 'Escrever testes',
      status: 'active',
      nextAction: null,
      estimatedMinutes: null,
      energy: null,
      position: 0,
      createdAt: '2026-01-01T09:00:00.000Z',
      updatedAt: '2026-01-01T09:00:00.000Z',
      completedAt: null,
    })
    expect(loaded.cycles[0].id).toBe('cycle-keep')
    expect(loaded.cycles[0].taskId).toBe('task-1')
    expect(loaded.cycles[0].task).toBe('Escrever testes')
    expect(loaded.cycles[0].startDate).toBeInstanceOf(Date)
    expect(loaded.activeCycleId).toBe('cycle-keep')
    expect(loaded.selectedTaskId).toBe('task-1')
    expect(loaded.settings.focusMinutes).toBe(40)
    expect(loaded.dailyPlans).toEqual([])
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy()
  })

  it('migrates legacy v1 cycles as focus tasks', () => {
    localStorage.setItem(
      STORAGE_KEY_V1,
      JSON.stringify({
        activeCycleId: 'old-1',
        cycles: [
          {
            id: 'old-1',
            task: 'Projeto legado',
            minutesAmount: 25,
            startDate: '2026-01-01T10:00:00.000Z',
          },
        ],
      }),
    )

    const loaded = loadPomodoroState(localStorage, NOW)

    expect(loaded.cycles[0].type).toBe('focus')
    expect(loaded.cycles[0].pausedMs).toBe(0)
    expect(loaded.cycles[0].id).toBe('old-1')
    expect(loaded.cycles[0].task).toBe('Projeto legado')
    expect(loaded.cycles[0].taskId).toBe(loaded.tasks[0].id)
    expect(loaded.activeCycleId).toBe('old-1')
    expect(loaded.tasks[0].title).toBe('Projeto legado')
    expect(loaded.tasks[0].status).toBe('active')
    expect(loaded.selectedTaskId).toBe(loaded.tasks[0].id)
    expect(loaded.dailyPlans).toEqual([])
  })

  it('preserves ids and cycles across v2 migration', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v2LegacyState()))

    const loaded = loadPomodoroState(localStorage, NOW)

    expect(loaded.tasks[0].id).toBe('task-1')
    expect(loaded.cycles[0].id).toBe('cycle-keep')
    expect(loaded.cycles[0].taskId).toBe('task-1')
  })

  it('uses the fallback clock for invalid or missing task dates', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tasks: [
          { id: 'task-1', name: 'Sem data' },
          { id: 'task-2', name: 'Data ruim', createdAt: 'not-a-date' },
        ],
        cycles: [
          {
            id: 'bad-cycle',
            task: 'Ignorar',
            minutesAmount: 25,
            startDate: 'not-a-date',
          },
        ],
      }),
    )

    const loaded = loadPomodoroState(localStorage, NOW)

    expect(loaded.tasks[0].createdAt).toBe(NOW)
    expect(loaded.tasks[1].createdAt).toBe(NOW)
    expect(loaded.cycles).toEqual([])
  })

  it('recovers from invalid JSON and keeps falling back', () => {
    localStorage.setItem(STORAGE_KEY_DESTRAVAI, '{not-json')
    localStorage.setItem(STORAGE_KEY, '{also-bad')
    localStorage.setItem(STORAGE_KEY_V1, '{still-bad')

    expect(loadPomodoroState()).toEqual(initialPomodoroState)
  })

  it('prefers the new DestravAI key over older formats', () => {
    persistPomodoroState(
      makeState({
        selectedTaskId: 'new-task',
        tasks: [makeTask({ id: 'new-task', title: 'Estado novo' })],
      }),
    )
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v2LegacyState()))
    localStorage.setItem(
      STORAGE_KEY_V1,
      JSON.stringify({
        activeCycleId: 'old-1',
        cycles: [],
      }),
    )

    const loaded = loadPomodoroState()

    expect(loaded.selectedTaskId).toBe('new-task')
    expect(loaded.tasks[0].title).toBe('Estado novo')
  })

  it('revives cycle dates after JSON.parse', () => {
    persistPomodoroState(
      makeState({
        cycles: [makeCycle()],
        activeCycleId: 'cycle-1',
      }),
    )

    const loaded = loadPomodoroState()

    expect(loaded.cycles[0].startDate).toBeInstanceOf(Date)
    expect(loaded.activeCycleId).toBe('cycle-1')
  })

  it('applies the dark class on the document', () => {
    applyThemeClass('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    applyThemeClass('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('creates deterministic v1 task ids without random UUID', () => {
    const uuid = vi.spyOn(globalThis.crypto, 'randomUUID')
    const payload = {
      activeCycleId: 'old-1',
      cycles: [
        {
          id: 'old-1',
          task: 'Projeto legado',
          minutesAmount: 25,
          startDate: '2026-01-01T10:00:00.000Z',
        },
        {
          id: 'old-2',
          task: 'Projeto legado',
          minutesAmount: 25,
          startDate: '2026-01-01T11:00:00.000Z',
        },
        {
          id: 'old-3',
          task: 'Outra tarefa',
          minutesAmount: 25,
          startDate: '2026-01-01T12:00:00.000Z',
        },
        {
          id: 'old-4',
          task: '',
          minutesAmount: 25,
          startDate: '2026-01-01T13:00:00.000Z',
        },
      ],
    }

    localStorage.setItem(STORAGE_KEY_V1, JSON.stringify(payload))
    const first = loadPomodoroState(localStorage, NOW)

    localStorage.clear()
    localStorage.setItem(STORAGE_KEY_V1, JSON.stringify(payload))
    const second = loadPomodoroState(localStorage, NOW)

    expect(uuid).not.toHaveBeenCalled()
    expect(first.tasks.map((task) => task.id)).toEqual(
      second.tasks.map((task) => task.id),
    )
    expect(first.tasks.map((task) => task.title)).toEqual([
      'Projeto legado',
      'Outra tarefa',
    ])
    expect(first.tasks[0].id).not.toBe(first.tasks[1].id)
    expect(first.cycles[0].id).toBe('old-1')
    expect(first.cycles[0].task).toBe('Projeto legado')
    expect(first.cycles[0].taskId).toBe(first.tasks[0].id)
    expect(first.cycles[1].taskId).toBe(first.tasks[0].id)
    expect(first.cycles[2].taskId).toBe(first.tasks[1].id)
    expect(first.cycles[3].taskId).toBeUndefined()
    expect(first.tasks[0].id.startsWith('v1:')).toBe(true)

    persistPomodoroState(first)
    const roundtrip = loadPomodoroState(localStorage, NOW)

    expect(roundtrip.tasks.map((task) => task.id)).toEqual(
      first.tasks.map((task) => task.id),
    )
  })

  it('does not duplicate v1 tasks on double hydration', () => {
    localStorage.setItem(
      STORAGE_KEY_V1,
      JSON.stringify({
        activeCycleId: 'old-1',
        cycles: [
          {
            id: 'old-1',
            task: 'Projeto legado',
            minutesAmount: 25,
            startDate: '2026-01-01T10:00:00.000Z',
          },
        ],
      }),
    )

    const first = loadPomodoroState(localStorage, NOW)
    const second = loadPomodoroState(localStorage, NOW)

    expect(second.tasks).toHaveLength(1)
    expect(second.tasks[0].id).toBe(first.tasks[0].id)

    persistPomodoroState(first)
    const afterPersist = loadPomodoroState(localStorage, NOW)

    expect(afterPersist.tasks).toHaveLength(1)
    expect(afterPersist.tasks[0].id).toBe(first.tasks[0].id)
  })

  it('roundtrips dailyPlans that still reference completed tasks', () => {
    persistPomodoroState(
      makeState({
        tasks: [
          makeTask({
            id: 'task-1',
            title: 'Concluída',
            status: 'done',
            completedAt: NOW,
          }),
        ],
        dailyPlans: [
          {
            date: '2026-01-01',
            essentialTaskId: 'task-1',
            secondaryTaskIds: [],
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      }),
    )

    const loaded = loadPomodoroState(localStorage, NOW)

    expect(loaded.tasks[0].status).toBe('done')
    expect(loaded.dailyPlans[0].essentialTaskId).toBe('task-1')
  })

  it('preserves completedAt after persisting an archived task that was done', () => {
    persistPomodoroState(
      makeState({
        tasks: [
          makeTask({
            id: 'task-1',
            title: 'Arquivada',
            status: 'archived',
            completedAt: NOW,
          }),
        ],
      }),
    )

    const loaded = loadPomodoroState(localStorage, NOW)

    expect(loaded.tasks[0].status).toBe('archived')
    expect(loaded.tasks[0].completedAt).toBe(NOW)
  })

  it('does not mix a valid empty DestravAI envelope with legacy v2 data', () => {
    localStorage.setItem(
      STORAGE_KEY_DESTRAVAI,
      JSON.stringify({
        version: 1,
        state: {
          ...initialPomodoroState,
          settings: { ...initialPomodoroState.settings },
        },
      }),
    )
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v2LegacyState()))

    const loaded = loadPomodoroState(localStorage, NOW)

    expect(loaded.tasks).toEqual([])
    expect(loaded.cycles).toEqual([])
    expect(loaded.selectedTaskId).toBeNull()
  })

  it('falls back to v2 when the new envelope is corrupted', () => {
    localStorage.setItem(STORAGE_KEY_DESTRAVAI, '{not-json')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v2LegacyState()))

    const loaded = loadPomodoroState(localStorage, NOW)

    expect(loaded.tasks[0].title).toBe('Escrever testes')
    expect(loaded.cycles[0].id).toBe('cycle-keep')
  })

  it('preserves an active cycle across reload', () => {
    persistPomodoroState(
      makeState({
        selectedTaskId: 'task-1',
        tasks: [makeTask({ id: 'task-1', title: 'Estudar testes' })],
        cycles: [makeCycle({ id: 'cycle-1', task: 'Estudar testes' })],
        activeCycleId: 'cycle-1',
      }),
    )

    const loaded = loadPomodoroState(localStorage, NOW)

    expect(loaded.activeCycleId).toBe('cycle-1')
    expect(loaded.cycles[0].id).toBe('cycle-1')
    expect(loaded.cycles[0].task).toBe('Estudar testes')
  })
})
