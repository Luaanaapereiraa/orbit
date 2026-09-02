import { describe, expect, it } from 'vitest'
import {
  addDailyPlanSecondary,
  canTaskEnterPlan,
  canTaskRemainInPlan,
  clearInvalidPlanReferences,
  formatLocalDateKey,
  getDailyPlanByDate,
  isValidLocalDateKey,
  normalizePlanIds,
  removeTaskFromCurrentAndFuturePlans,
  removeTaskFromPlans,
  resolvePlanTasks,
  sanitizeDailyPlan,
  setDailyPlanEssential,
  upsertDailyPlan,
} from './index'
import { makeDailyPlan, makeTask } from '../test/factories'

const NOW = '2026-01-01T12:00:00.000Z'
const LATER = '2026-01-01T13:00:00.000Z'
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

  it('formats December and January using 1-based months', () => {
    expect(formatLocalDateKey(2026, 12, 31)).toBe('2026-12-31')
    expect(formatLocalDateKey(2027, 1, 1)).toBe('2027-01-01')
    expect(formatLocalDateKey(2026, 0, 1)).toBeNull()
    expect(isValidLocalDateKey('2026-12-31')).toBe(true)
    expect(isValidLocalDateKey('2027-01-01')).toBe(true)
  })

  it('rejects leap-year and calendar edge cases', () => {
    expect(formatLocalDateKey(2025, 2, 29)).toBeNull()
    expect(formatLocalDateKey(2000, 2, 29)).toBe('2000-02-29')
    expect(formatLocalDateKey(1900, 2, 29)).toBeNull()
    expect(formatLocalDateKey(2026, 13, 1)).toBeNull()
    expect(formatLocalDateKey(2026, 4, 31)).toBeNull()
    expect(formatLocalDateKey(-1, 1, 1)).toBeNull()
    expect(isValidLocalDateKey('2026-1-01')).toBe(false)
    expect(isValidLocalDateKey('not-a-date')).toBe(false)
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
  const inbox = makeTask({
    id: 'inbox',
    title: 'Caixa',
    status: 'inbox',
    position: 4,
  })
  const tasks = [active, second, third, extra, done, archived, inbox]

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

  it('allows inbox and active tasks to enter a plan', () => {
    expect(canTaskEnterPlan(active)).toBe(true)
    expect(canTaskEnterPlan(inbox)).toBe(true)

    const plans = setDailyPlanEssential([], DATE, inbox.id, NOW, tasks)

    expect(plans[0].essentialTaskId).toBe(inbox.id)
  })

  it('rejects done and archived tasks from entering a new plan', () => {
    expect(canTaskEnterPlan(done)).toBe(false)
    expect(canTaskEnterPlan(archived)).toBe(false)
    expect(canTaskRemainInPlan(done)).toBe(true)
    expect(canTaskRemainInPlan(archived)).toBe(true)
    expect(canTaskRemainInPlan(undefined)).toBe(false)

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

  it('resolves inbox, active, done and archived references', () => {
    const plan = makeDailyPlan({
      essentialTaskId: done.id,
      secondaryTaskIds: [archived.id, second.id],
    })

    expect(resolvePlanTasks(plan, tasks)).toEqual({
      essential: done,
      secondaries: [archived, second],
    })
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
    expect(plan).toBe(withSecondary[0])
    expect(plan && resolvePlanTasks(plan, tasks)).toEqual({
      essential: active,
      secondaries: [second],
    })
  })

  it('sanitizes missing ids but keeps completed and archived references', () => {
    const plan = makeDailyPlan({
      essentialTaskId: done.id,
      secondaryTaskIds: [second.id, 'gone', archived.id],
    })

    expect(sanitizeDailyPlan(plan, tasks)).toMatchObject({
      essentialTaskId: done.id,
      secondaryTaskIds: [second.id, archived.id],
    })
  })

  it('does not mutate plans or tasks in selectors and normalizers', () => {
    const secondaryTaskIds = Object.freeze([second.id, third.id])
    const plan = Object.freeze(
      makeDailyPlan({
        essentialTaskId: done.id,
        secondaryTaskIds: secondaryTaskIds as string[],
      }),
    )
    const frozenTasks = Object.freeze([...tasks])
    const originalSecondaries = [...plan.secondaryTaskIds]
    const originalTaskIds = frozenTasks.map((task) => task.id)

    expect(() => resolvePlanTasks(plan, frozenTasks)).not.toThrow()
    expect(() => sanitizeDailyPlan(plan, frozenTasks)).not.toThrow()
    expect(() => normalizePlanIds(plan)).not.toThrow()
    expect(() => getDailyPlanByDate([plan], DATE)).not.toThrow()

    expect(plan.secondaryTaskIds).toEqual(originalSecondaries)
    expect(plan.secondaryTaskIds).toBe(secondaryTaskIds)
    expect(frozenTasks.map((task) => task.id)).toEqual(originalTaskIds)
    expect(getDailyPlanByDate([plan], DATE)).toBe(plan)

    const resolved = resolvePlanTasks(plan, frozenTasks)
    expect(resolved.secondaries.map((task) => task.id)).toEqual([
      second.id,
      third.id,
    ])
  })

  it('does not let upsert erase historical refs or introduce done ids', () => {
    const existing = [
      makeDailyPlan({
        essentialTaskId: done.id,
        secondaryTaskIds: [second.id],
      }),
    ]
    const kept = upsertDailyPlan(
      existing,
      {
        date: DATE,
        now: LATER,
        secondaryTaskIds: [second.id, third.id],
      },
      tasks,
    )
    const rejected = upsertDailyPlan(
      existing,
      {
        date: DATE,
        now: LATER,
        essentialTaskId: archived.id,
        secondaryTaskIds: [archived.id, second.id],
      },
      tasks,
    )

    expect(kept[0].essentialTaskId).toBe(done.id)
    expect(kept[0].secondaryTaskIds).toEqual([second.id, third.id])
    expect(rejected[0].essentialTaskId).toBe(done.id)
    expect(rejected[0].secondaryTaskIds).toEqual([second.id])
  })

  it('keeps completed references when clearing invalid ids', () => {
    const plans = [
      makeDailyPlan({
        essentialTaskId: done.id,
        secondaryTaskIds: [archived.id, 'missing'],
      }),
    ]
    const next = clearInvalidPlanReferences(plans, tasks, LATER)

    expect(next[0].essentialTaskId).toBe(done.id)
    expect(next[0].secondaryTaskIds).toEqual([archived.id])
    expect(next[0].updatedAt).toBe(LATER)
  })

  it('removes a deleted task from every plan', () => {
    const past = makeDailyPlan({
      date: '2025-12-31',
      essentialTaskId: active.id,
      secondaryTaskIds: [second.id],
    })
    const current = makeDailyPlan({
      date: DATE,
      secondaryTaskIds: [active.id, third.id],
    })
    const unrelated = makeDailyPlan({
      date: '2026-01-02',
      essentialTaskId: extra.id,
    })
    const next = removeTaskFromPlans(
      [past, current, unrelated],
      active.id,
      LATER,
    )

    expect(next[0].essentialTaskId).toBeNull()
    expect(next[0].secondaryTaskIds).toEqual([second.id])
    expect(next[1].secondaryTaskIds).toEqual([third.id])
    expect(next[2]).toBe(unrelated)
  })

  it('removes a task only from the current date and future plans', () => {
    const past = makeDailyPlan({
      date: '2025-12-31',
      essentialTaskId: active.id,
    })
    const current = makeDailyPlan({
      date: DATE,
      secondaryTaskIds: [active.id, second.id],
    })
    const future = makeDailyPlan({
      date: '2026-01-02',
      essentialTaskId: active.id,
      secondaryTaskIds: [second.id],
    })
    const next = removeTaskFromCurrentAndFuturePlans(
      [past, current, future],
      active.id,
      DATE,
      LATER,
    )

    expect(next[0]).toBe(past)
    expect(next[1].secondaryTaskIds).toEqual([second.id])
    expect(next[2].essentialTaskId).toBeNull()
    expect(next[2].secondaryTaskIds).toEqual([second.id])
  })

  it('is a no-op when currentDateKey is invalid', () => {
    const plans = [
      makeDailyPlan({
        date: DATE,
        essentialTaskId: active.id,
      }),
    ]

    expect(
      removeTaskFromCurrentAndFuturePlans(plans, active.id, '2026/01/01', LATER),
    ).toBe(plans)
  })
})
