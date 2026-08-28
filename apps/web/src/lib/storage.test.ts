import { afterEach, describe, expect, it } from 'vitest'
import {
  STORAGE_KEY,
  STORAGE_KEY_V1,
  applyThemeClass,
  loadPomodoroState,
  persistPomodoroState,
} from '../lib/storage'
import { initialPomodoroState } from '@destravai/core'
import { makeState } from '../test/factories'

describe('storage', () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('returns the initial state when nothing is stored', () => {
    expect(loadPomodoroState()).toEqual(initialPomodoroState)
  })

  it('returns the initial state when storage is unavailable', () => {
    expect(loadPomodoroState(null)).toEqual(initialPomodoroState)
  })

  it('does not write when storage is unavailable', () => {
    expect(() => persistPomodoroState(makeState(), null)).not.toThrow()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('persists and reloads v2 state, filling missing settings', () => {
    persistPomodoroState(
      makeState({
        selectedTaskId: 'task-1',
        settings: {
          ...initialPomodoroState.settings,
          focusMinutes: 40,
        },
      }),
    )

    const loaded = loadPomodoroState()

    expect(loaded.selectedTaskId).toBe('task-1')
    expect(loaded.settings.focusMinutes).toBe(40)
    expect(loaded.settings.shortBreakMinutes).toBe(5)
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy()
  })

  it('recovers from invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not-json')

    expect(loadPomodoroState()).toEqual(initialPomodoroState)
  })

  it('migrates v1 cycles as focus tasks', () => {
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

    const loaded = loadPomodoroState()

    expect(loaded.cycles[0].type).toBe('focus')
    expect(loaded.cycles[0].pausedMs).toBe(0)
    expect(loaded.activeCycleId).toBe('old-1')
    expect(loaded.tasks[0].name).toBe('Projeto legado')
    expect(loaded.selectedTaskId).toBe(loaded.tasks[0].id)
  })

  it('applies the dark class on the document', () => {
    applyThemeClass('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    applyThemeClass('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
