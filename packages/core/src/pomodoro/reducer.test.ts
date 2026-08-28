import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addDailyPlanSecondaryAction,
  addNewCycleAction,
  addTaskAction,
  archiveTaskAction,
  clearHistoryAction,
  clearInvalidPlanReferencesAction,
  completeTaskAction,
  deleteTaskAction,
  finishCycleAction,
  hydratePomodoroStateAction,
  interruptCurrentCycleAction,
  moveTaskToActiveAction,
  moveTaskToInboxAction,
  pauseCurrentCycleAction,
  reopenTaskAction,
  reorderTasksAction,
  resumeCurrentCycleAction,
  selectTaskAction,
  setDailyPlanEssentialAction,
  updateSettingsAction,
  updateTaskEstimatedMinutesAction,
  updateTaskTitleAction,
  upsertDailyPlanAction,
} from './actions'
import { pomodoroReducer } from './index'
import { makeCycle, makeDailyPlan, makeState, makeTask } from '../test/factories'

const NOW = '2026-01-01T12:00:00.000Z'
const LATER = '2026-01-01T13:00:00.000Z'
const DATE = '2026-01-01'

describe('pomodoroReducer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts a new cycle and interrupts the previous active one', () => {
    const current = makeCycle({ id: 'old' })
    const next = makeCycle({ id: 'new', task: 'Nova tarefa' })
    const state = makeState({
      cycles: [current],
      activeCycleId: current.id,
    })

    const result = pomodoroReducer(state, addNewCycleAction(next))

    expect(result.activeCycleId).toBe('new')
    expect(result.cycles[0].interruptedDate).toBeInstanceOf(Date)
    expect(result.cycles[1].id).toBe('new')
  })

  it('interrupts the active cycle', () => {
    const cycle = makeCycle()
    const state = makeState({ cycles: [cycle], activeCycleId: cycle.id })

    const result = pomodoroReducer(state, interruptCurrentCycleAction())

    expect(result.activeCycleId).toBeNull()
    expect(result.cycles[0].interruptedDate).toBeInstanceOf(Date)
  })

  it('finishes a cycle and can start the next break', () => {
    const focus = makeCycle()
    const brk = makeCycle({
      id: 'break-1',
      type: 'shortBreak',
      minutesAmount: 5,
    })
    const state = makeState({ cycles: [focus], activeCycleId: focus.id })

    const result = pomodoroReducer(state, finishCycleAction(brk))

    expect(result.cycles[0].finishedDate).toBeInstanceOf(Date)
    expect(result.activeCycleId).toBe('break-1')
    expect(result.cycles).toHaveLength(2)
  })

  it('pauses and resumes, accumulating pause time', () => {
    const cycle = makeCycle({
      startDate: new Date('2026-01-01T11:59:00.000Z'),
    })
    const state = makeState({ cycles: [cycle], activeCycleId: cycle.id })

    const paused = pomodoroReducer(state, pauseCurrentCycleAction())
    expect(paused.cycles[0].pausedAt).toBeInstanceOf(Date)

    vi.setSystemTime(new Date('2026-01-01T12:00:30.000Z'))
    const resumed = pomodoroReducer(paused, resumeCurrentCycleAction())

    expect(resumed.cycles[0].pausedAt).toBeUndefined()
    expect(resumed.cycles[0].pausedMs).toBe(30_000)
  })

  it('does not pause twice', () => {
    const cycle = makeCycle({ pausedAt: new Date() })
    const state = makeState({ cycles: [cycle], activeCycleId: cycle.id })

    const result = pomodoroReducer(state, pauseCurrentCycleAction())

    expect(result.cycles[0]).toBe(cycle)
    expect(result.cycles[0].pausedAt).toEqual(cycle.pausedAt)
  })

  it('clears history but keeps the active cycle', () => {
    const done = makeCycle({ id: 'done', finishedDate: new Date() })
    const active = makeCycle({ id: 'active' })
    const state = makeState({
      cycles: [done, active],
      activeCycleId: active.id,
    })

    const result = pomodoroReducer(state, clearHistoryAction())

    expect(result.cycles).toEqual([active])
  })

  it('adds, selects and deletes tasks', () => {
    const withTask = pomodoroReducer(
      makeState(),
      addTaskAction({
        id: 'task-1',
        title: 'Ler',
        now: NOW,
        status: 'active',
      }),
    )

    expect(withTask.tasks).toHaveLength(1)
    expect(withTask.tasks[0].title).toBe('Ler')
    expect(withTask.selectedTaskId).toBe('task-1')

    const selected = pomodoroReducer(withTask, selectTaskAction('task-1'))
    expect(selected.selectedTaskId).toBe('task-1')

    const deleted = pomodoroReducer(
      selected,
      deleteTaskAction('task-1', LATER),
    )
    expect(deleted.tasks).toHaveLength(0)
    expect(deleted.selectedTaskId).toBeNull()
  })

  it('updates settings without replacing unspecified fields', () => {
    const result = pomodoroReducer(
      makeState(),
      updateSettingsAction({ focusMinutes: 50, theme: 'light' }),
    )

    expect(result.settings.focusMinutes).toBe(50)
    expect(result.settings.theme).toBe('light')
    expect(result.settings.shortBreakMinutes).toBe(5)
  })

  it('replaces the whole state on hydrate', () => {
    const stored = makeState({
      selectedTaskId: 'task-1',
      tasks: [makeTask()],
    })

    const result = pomodoroReducer(
      makeState(),
      hydratePomodoroStateAction(stored),
    )

    expect(result).toEqual(stored)
  })

  it('starts dailyPlans empty', () => {
    expect(makeState().dailyPlans).toEqual([])
  })
})

describe('task and daily plan actions', () => {
  const essencial = makeTask({ id: 'essencial', title: 'Essencial' })
  const secundaria = makeTask({
    id: 'secundaria',
    title: 'Secundária',
    position: 1,
  })
  const outra = makeTask({ id: 'outra', title: 'Outra', position: 2 })

  it('creates a valid task and normalizes the title', () => {
    const result = pomodoroReducer(
      makeState(),
      addTaskAction({ id: 'task-1', title: '  Focar  ', now: NOW }),
    )

    expect(result.tasks[0].title).toBe('Focar')
    expect(result.tasks[0].status).toBe('active')
  })

  it('updates fields and rejects an invalid duration', () => {
    const state = makeState({ tasks: [essencial] })
    const renamed = pomodoroReducer(
      state,
      updateTaskTitleAction(essencial.id, 'Novo', LATER),
    )
    expect(renamed.tasks[0].title).toBe('Novo')

    const invalid = pomodoroReducer(
      renamed,
      updateTaskEstimatedMinutesAction(essencial.id, 0, LATER),
    )
    expect(invalid.tasks[0].estimatedMinutes).toBeNull()
    expect(invalid.tasks).toBe(renamed.tasks)
  })

  it('moves a task between inbox and active', () => {
    const state = makeState({ tasks: [essencial] })
    const inbox = pomodoroReducer(
      state,
      moveTaskToInboxAction(essencial.id, LATER),
    )
    expect(inbox.tasks[0].status).toBe('inbox')

    const active = pomodoroReducer(
      inbox,
      moveTaskToActiveAction(essencial.id, LATER),
    )
    expect(active.tasks[0].status).toBe('active')
  })

  it('completes, reopens and archives a task', () => {
    const state = makeState({
      tasks: [essencial],
      selectedTaskId: essencial.id,
    })
    const completed = pomodoroReducer(
      state,
      completeTaskAction(essencial.id, LATER),
    )

    expect(completed.tasks[0].status).toBe('done')
    expect(completed.tasks[0].completedAt).toBe(LATER)
    expect(completed.selectedTaskId).toBeNull()

    const reopened = pomodoroReducer(
      completed,
      reopenTaskAction(essencial.id, LATER),
    )
    expect(reopened.tasks[0].status).toBe('active')
    expect(reopened.tasks[0].completedAt).toBeNull()

    const archived = pomodoroReducer(
      reopened,
      archiveTaskAction(essencial.id, LATER),
    )
    expect(archived.tasks[0].status).toBe('archived')
  })

  it('reorders tasks by position', () => {
    const state = makeState({ tasks: [essencial, secundaria, outra] })
    const result = pomodoroReducer(
      state,
      reorderTasksAction(['outra', 'essencial', 'secundaria'], LATER),
    )

    expect(result.tasks.find((task) => task.id === 'outra')?.position).toBe(0)
    expect(result.tasks.find((task) => task.id === 'essencial')?.position).toBe(
      1,
    )
  })

  it('rejects a third secondary and duplicated plan ids', () => {
    const extra = makeTask({ id: 'extra', title: 'Extra', position: 3 })
    const state = makeState({
      tasks: [essencial, secundaria, outra, extra],
    })
    const planned = pomodoroReducer(
      state,
      upsertDailyPlanAction({
        date: DATE,
        now: NOW,
        essentialTaskId: essencial.id,
        secondaryTaskIds: [secundaria.id, secundaria.id, outra.id, extra.id],
      }),
    )

    expect(planned.dailyPlans[0].secondaryTaskIds).toEqual([
      secundaria.id,
      outra.id,
    ])

    const rejected = pomodoroReducer(
      planned,
      addDailyPlanSecondaryAction(DATE, extra.id, LATER),
    )
    expect(rejected.dailyPlans[0].secondaryTaskIds).toHaveLength(2)
  })

  it('does not keep the essential task among the secondaries', () => {
    const state = makeState({ tasks: [essencial, secundaria] })
    const result = pomodoroReducer(
      state,
      upsertDailyPlanAction({
        date: DATE,
        now: NOW,
        essentialTaskId: essencial.id,
        secondaryTaskIds: [essencial.id, secundaria.id],
      }),
    )

    expect(result.dailyPlans[0].essentialTaskId).toBe(essencial.id)
    expect(result.dailyPlans[0].secondaryTaskIds).toEqual([secundaria.id])
  })

  it('does not add done or archived tasks to a plan', () => {
    const done = makeTask({
      id: 'done',
      status: 'done',
      completedAt: NOW,
    })
    const archived = makeTask({ id: 'archived', status: 'archived' })
    const state = makeState({ tasks: [essencial, done, archived] })
    const result = pomodoroReducer(
      state,
      upsertDailyPlanAction({
        date: DATE,
        now: NOW,
        essentialTaskId: done.id,
        secondaryTaskIds: [archived.id],
      }),
    )

    expect(result.dailyPlans[0].essentialTaskId).toBeNull()
    expect(result.dailyPlans[0].secondaryTaskIds).toEqual([])
  })

  it('removes a deleted task from daily plans', () => {
    const state = makeState({
      tasks: [essencial, secundaria],
      dailyPlans: [
        makeDailyPlan({
          essentialTaskId: essencial.id,
          secondaryTaskIds: [secundaria.id],
        }),
      ],
    })
    const result = pomodoroReducer(
      state,
      deleteTaskAction(essencial.id, LATER),
    )

    expect(result.tasks.map((task) => task.id)).toEqual([secundaria.id])
    expect(result.dailyPlans[0].essentialTaskId).toBeNull()
    expect(result.dailyPlans[0].secondaryTaskIds).toEqual([secundaria.id])
  })

  it('removes a completed task from daily plans', () => {
    const state = makeState({
      tasks: [essencial, secundaria],
      selectedTaskId: essencial.id,
      dailyPlans: [
        makeDailyPlan({
          essentialTaskId: essencial.id,
          secondaryTaskIds: [secundaria.id],
        }),
      ],
    })
    const result = pomodoroReducer(
      state,
      completeTaskAction(essencial.id, LATER),
    )

    expect(result.dailyPlans[0].essentialTaskId).toBeNull()
    expect(result.tasks[0].status).toBe('done')
  })

  it('clears invalid plan references on demand', () => {
    const state = makeState({
      tasks: [essencial],
      dailyPlans: [
        makeDailyPlan({
          essentialTaskId: 'missing',
          secondaryTaskIds: [essencial.id, 'gone'],
        }),
      ],
    })
    const result = pomodoroReducer(
      state,
      clearInvalidPlanReferencesAction(LATER),
    )

    expect(result.dailyPlans[0].essentialTaskId).toBeNull()
    expect(result.dailyPlans[0].secondaryTaskIds).toEqual([essencial.id])
  })

  it('sets the essential task of a date', () => {
    const state = makeState({ tasks: [essencial] })
    const result = pomodoroReducer(
      state,
      setDailyPlanEssentialAction(DATE, essencial.id, NOW),
    )

    expect(result.dailyPlans[0].date).toBe(DATE)
    expect(result.dailyPlans[0].essentialTaskId).toBe(essencial.id)
  })
})
