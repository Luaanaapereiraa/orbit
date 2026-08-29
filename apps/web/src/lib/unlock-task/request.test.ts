import { describe, expect, it } from 'vitest'
import { makeDailyPlan, makeTask } from '../../test/factories'
import {
  buildUnlockTaskRequest,
  canRequestUnlock,
  clampAvailableMinutes,
  plannedTaskCountForDate,
  todayRoleForTask,
} from './request'

describe('unlock-task request', () => {
  it('builds a contract-valid payload from the local task and today plan', () => {
    const task = makeTask({
      id: 'task-unlock',
      title: 'Escrever o parágrafo',
      nextAction: 'Abrir o arquivo',
      energy: 'low',
      estimatedMinutes: 30,
      status: 'active',
    })
    const request = buildUnlockTaskRequest({
      clientRequestId: '550e8400-e29b-41d4-a716-446655440000',
      task,
      blockageReason: 'overwhelmed',
      blockageDetails: '  Muita coisa aberta  ',
      availableMinutes: 20,
      currentEnergy: 'low',
      dateKey: '2026-01-15',
      role: 'essential',
      plannedTaskCount: 1,
    })

    expect(request.task.id).toBe('task-unlock')
    expect(request.task.status).toBe('active')
    expect(request.blockageDetails).toBe('Muita coisa aberta')
    expect(request.today).toEqual({
      date: '2026-01-15',
      role: 'essential',
      plannedTaskCount: 1,
    })
    expect(request.locale).toBe('pt-BR')
  })

  it('does not unlock done or archived tasks', () => {
    expect(canRequestUnlock(makeTask({ status: 'done' }))).toBe(false)
    expect(canRequestUnlock(makeTask({ status: 'archived' }))).toBe(false)
    expect(() =>
      buildUnlockTaskRequest({
        clientRequestId: '550e8400-e29b-41d4-a716-446655440000',
        task: makeTask({ status: 'done' }),
        blockageReason: 'other',
        blockageDetails: null,
        availableMinutes: 20,
        currentEnergy: null,
        dateKey: '2026-01-15',
        role: 'unplanned',
        plannedTaskCount: 0,
      }),
    ).toThrow(/não pode receber ajuda/)
  })

  it('reads today role and planned count from the local daily plan', () => {
    const plans = [
      makeDailyPlan({
        date: '2026-01-15',
        essentialTaskId: 'e1',
        secondaryTaskIds: ['s1'],
      }),
    ]
    expect(todayRoleForTask('e1', '2026-01-15', plans)).toBe('essential')
    expect(todayRoleForTask('s1', '2026-01-15', plans)).toBe('secondary')
    expect(todayRoleForTask('other', '2026-01-15', plans)).toBe('unplanned')
    expect(plannedTaskCountForDate('2026-01-15', plans)).toBe(2)
    expect(clampAvailableMinutes(2)).toBe(5)
    expect(clampAvailableMinutes(400)).toBe(120)
  })
})
