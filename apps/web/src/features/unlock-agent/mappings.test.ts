import { describe, expect, it } from 'vitest'
import { makeDailyPlan, makeTask } from '../../test/factories'
import {
  buildUnlockTaskRequest,
  canRequestUnlock,
  createUnlockFormFields,
  suggestUnlockTask,
} from './mappings'

describe('unlock-agent mappings', () => {
  it('excludes done and archived tasks from suggestions', () => {
    const essential = makeTask({
      id: 'done-1',
      status: 'done',
      completedAt: '2026-08-29T10:00:00.000Z',
    })
    const secondary = makeTask({
      id: 'sec-1',
      title: 'Secundária',
      position: 1,
    })
    const archived = makeTask({ id: 'arch-1', status: 'archived', position: 2 })

    const suggested = suggestUnlockTask({
      tasks: [essential, secondary, archived],
      dailyPlans: [
        makeDailyPlan({
          date: '2026-08-29',
          essentialTaskId: 'done-1',
          secondaryTaskIds: ['sec-1'],
        }),
      ],
      dateKey: '2026-08-29',
      selectedTaskId: 'arch-1',
    })

    expect(suggested?.id).toBe('sec-1')
    expect(canRequestUnlock(essential)).toBe(false)
    expect(canRequestUnlock(archived)).toBe(false)
  })

  it('prefers the opened task, then essential, then selected', () => {
    const essential = makeTask({ id: 'ess-1', title: 'Essencial' })
    const inbox = makeTask({
      id: 'in-1',
      title: 'Inbox',
      status: 'inbox',
      position: 1,
    })

    expect(
      suggestUnlockTask({
        tasks: [essential, inbox],
        dailyPlans: [
          makeDailyPlan({ date: '2026-08-29', essentialTaskId: 'ess-1' }),
        ],
        dateKey: '2026-08-29',
        selectedTaskId: 'in-1',
        preferredTaskId: 'in-1',
      })?.id,
    ).toBe('in-1')

    expect(
      suggestUnlockTask({
        tasks: [essential, inbox],
        dailyPlans: [
          makeDailyPlan({ date: '2026-08-29', essentialTaskId: 'ess-1' }),
        ],
        dateKey: '2026-08-29',
        selectedTaskId: 'in-1',
      })?.id,
    ).toBe('ess-1')
  })

  it('builds a request with a reused clientRequestId', () => {
    const task = makeTask({ id: 'task-1', title: 'Escrever testes' })
    const fields = {
      ...createUnlockFormFields('task-1', 25),
      clientRequestId: '550e8400-e29b-41d4-a716-446655440000',
    }

    const request = buildUnlockTaskRequest({
      fields,
      task,
      dateKey: '2026-08-29',
      dailyPlans: [
        makeDailyPlan({ date: '2026-08-29', essentialTaskId: 'task-1' }),
      ],
    })

    expect(request.clientRequestId).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(request.today.role).toBe('essential')
    expect(request.availableMinutes).toBe(25)
  })
})
