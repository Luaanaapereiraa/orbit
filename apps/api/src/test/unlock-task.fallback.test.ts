import { describe, expect, it } from 'vitest'
import { buildFallbackPlan, splitMinutes } from '../agents/unlock-task/fallback.js'
import { validateUnlockPlanDeterministic } from '../agents/unlock-task/tools/validate-unlock-plan.js'
import { validUnlockRequest } from './helpers.js'

describe('splitMinutes', () => {
  it('never returns a sum greater than the available budget', () => {
    expect(splitMinutes(1)).toEqual([1, 0])
    expect(splitMinutes(1)[0] + splitMinutes(1)[1]).toBeLessThanOrEqual(1)
    expect(splitMinutes(0)).toEqual([0, 0])
    expect(splitMinutes(2)).toEqual([1, 1])
    expect(splitMinutes(5)).toEqual([2, 3])
    expect(splitMinutes(20)).toEqual([10, 10])
  })
})

describe('buildFallbackPlan', () => {
  it('fits two positive steps inside a valid availableMinutes budget', () => {
    const request = validUnlockRequest({ availableMinutes: 5 })
    const plan = buildFallbackPlan(request)
    expect(plan.steps[0].minutes + plan.steps[1].minutes).toBe(plan.totalMinutes)
    expect(plan.totalMinutes).toBeLessThanOrEqual(request.availableMinutes)
    expect(validateUnlockPlanDeterministic(plan, request).valid).toBe(true)
  })
})
