import { describe, expect, it } from 'vitest'
import {
  addDailyPlanSecondary,
  canTaskEnterPlan,
  formatLocalDateKey,
  getDailyPlanByDate,
  isValidLocalDateKey,
  normalizePlanIds,
  resolvePlanTasks,
  sanitizeDailyPlan,
  setDailyPlanEssential,
  upsertDailyPlan,
} from './index'
import { makeDailyPlan, makeTask } from '../test/factories'

const NOW = '2026-01-01T12:00:00.000Z'
const DATE = '2026-01-01'

describe('local date keys', () => {
  it('validates and formats YYYY-MM-DD without UTC conversion', () => {
    expect(isValidLocalDateKey('2026-01-01')).toBe(true)
    expect(isValidLocalDateKey('2026-02-30')).toBe(false)
    expect(isValidLocalDateKey('2026-13-01')).toBe(false)
    expect(formatLocalDateKey(2026, 1, 1)).toBe('2026-01-01')
    expect(formatLocalDateKey(2026, 2, 30)).toBeNull()
    expect(formatLocalDateKey(2024, 2, 29)).toBe('2024-02-29')
  })
})

describe('plan rules', () => {
  const active = makeTask({ id: 'essencial', title: 'Essencial' })
  const second = makeTask({ id: 'secundaria-1', title: 'Sec 1', position: 1 })
  const third = makeTask({ id: 'secundaria-2', title: 'Sec 2', position: 2 })
  const extra = makeTask({ id: 'extra', title: 'Extra', position: 3 })
  const done = makeTask({
    id: 'done',
    title: 'Feita',
    status: 'done',
    completedAt: NOW,
  })
  const archived = makeTask({
    id: 'archived',
    title: 'Arquivada',
    status: 'archived',
  })
  const tasks = [active, second, third, extra, done, archived]

  it('limits a plan to two unique secondaries', () => {
    const withTwo = addDailyPlanSecondary(
      addDailyPlanSecondary([], DATE, second.id, NOW, tasks),
      DATE,
      third.id,
      NOW,
      tasks,
    )
    const rejected = addDailyPlanSecondary(
      withTwo,
      DATE,
      extra.id,
      NOW,
      tasks,
    )

    expect(withTwo[0].secondaryTaskIds).toEqual([second.id, third.id])
    expect(rejected).toBe(withTwo)
  })

  it('drops duplicated secondary ids', () => {
    const plan = normalizePlanIds(
      makeDailyPlan({
        essentialTaskId: active.id,
        secondaryTaskIds: [second.id, second.id, third.id],
      }),
    )

    expect(plan.secondaryTaskIds).toEqual([second.id, third.id])
  })

  it('removes the essential task from the secondaries', () => {
    const plan = normalizePlanIds(
      makeDailyPlan({
        essentialTaskId: active.id,
        secondaryTaskIds: [active.id, second.id],
      }),
    )

    expect(plan.essentialTaskId).toBe(active.id)
    expect(plan.secondaryTaskIds).toEqual([second.id])
  })

  it('rejects done and archived tasks in a plan', () => {
    expect(canTaskEnterPlan(done)).toBe(false)
    expect(canTaskEnterPlan(archived)).toBe(false)

    const plans = upsertDailyPlan(
      [],
      {
        date: DATE,
        now: NOW,
        essentialTaskId: done.id,
        secondaryTaskIds: [archived.id, second.id],
      },
      tasks,
    )

    expect(plans[0].essentialTaskId).toBeNull()
    expect(plans[0].secondaryTaskIds).toEqual([second.id])
  })

  it('resolves plan tasks and finds a plan by date', () => {
    const plans = setDailyPlanEssential([], DATE, active.id, NOW, tasks)
    const withSecondary = addDailyPlanSecondary(
      plans,
      DATE,
      second.id,
      NOW,
      tasks,
    )
    const plan = getDailyPlanByDate(withSecondary, DATE)

    expect(plan).not.toBeNull()
    expect(plan && resolvePlanTasks(plan, tasks)).toEqual({
      essential: active,
      secondaries: [second],
    })
  })

  it('sanitizes ids against the current task list', () => {
    const plan = makeDailyPlan({
      essentialTaskId: 'missing',
      secondaryTaskIds: [second.id, 'gone'],
    })

    expect(sanitizeDailyPlan(plan, tasks)).toMatchObject({
      essentialTaskId: null,
      secondaryTaskIds: [second.id],
    })
  })
})
