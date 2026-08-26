import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addNewCycleAction,
  addTaskAction,
  clearHistoryAction,
  deleteTaskAction,
  finishCycleAction,
  interruptCurrentCycleAction,
  pauseCurrentCycleAction,
  resumeCurrentCycleAction,
  selectTaskAction,
  updateSettingsAction,
} from './actions'
import { pomodoroReducer } from './reducer'
import { makeCycle, makeState } from '../../test/factories'

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
    const task = { id: 'task-1', name: 'Ler', createdAt: new Date() }
    const withTask = pomodoroReducer(makeState(), addTaskAction(task))

    expect(withTask.tasks).toHaveLength(1)
    expect(withTask.selectedTaskId).toBe('task-1')

    const selected = pomodoroReducer(
      withTask,
      selectTaskAction('task-1'),
    )
    expect(selected.selectedTaskId).toBe('task-1')

    const deleted = pomodoroReducer(selected, deleteTaskAction('task-1'))
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
})
