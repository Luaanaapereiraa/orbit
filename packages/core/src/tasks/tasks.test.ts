import { describe, expect, it } from 'vitest'
import {
  addTaskToList,
  archiveTaskInList,
  buildTask,
  completeTaskInList,
  migrateLegacyTasks,
  moveTaskBetweenInboxAndActive,
  normalizeTitle,
  reopenTaskInList,
  reorderTasksByIds,
  sortTasksByPosition,
  tasksByStatus,
  tasksForCommonList,
  updateTaskEnergy,
  updateTaskEstimatedMinutes,
  updateTaskNextAction,
  updateTaskTitle,
} from './index'
import { makeTask } from '../test/factories'

const NOW = '2026-01-01T12:00:00.000Z'
const LATER = '2026-01-01T13:00:00.000Z'

describe('buildTask', () => {
  it('creates a valid active task from caller id and clock', () => {
    const task = buildTask({
      id: 'task-1',
      title: 'Escrever testes',
      now: NOW,
      status: 'active',
    })

    expect(task).toEqual({
      id: 'task-1',
      title: 'Escrever testes',
      nextAction: null,
      status: 'active',
      estimatedMinutes: null,
      energy: null,
      position: 0,
      createdAt: NOW,
      updatedAt: NOW,
      completedAt: null,
    })
  })

  it('normalizes the title and rejects an empty one', () => {
    expect(normalizeTitle('  Focar  ')).toBe('Focar')
    expect(buildTask({ id: 'task-1', title: '   ', now: NOW })).toBeNull()
  })
})

describe('task field updates', () => {
  const task = makeTask()

  it('updates title, next action, estimate and energy', () => {
    let tasks = [task]
    tasks = updateTaskTitle(tasks, task.id, '  Novo título  ', LATER)
    tasks = updateTaskNextAction(tasks, task.id, ' Abrir o editor ', LATER)
    tasks = updateTaskEstimatedMinutes(tasks, task.id, 25, LATER)
    tasks = updateTaskEnergy(tasks, task.id, 'high', LATER)

    expect(tasks[0]).toMatchObject({
      title: 'Novo título',
      nextAction: 'Abrir o editor',
      estimatedMinutes: 25,
      energy: 'high',
      updatedAt: LATER,
    })
  })

  it('ignores an invalid estimated duration', () => {
    const tasks = [task]
    expect(updateTaskEstimatedMinutes(tasks, task.id, 0, LATER)).toBe(tasks)
    expect(updateTaskEstimatedMinutes(tasks, task.id, -10, LATER)).toBe(tasks)
    expect(updateTaskEstimatedMinutes(tasks, task.id, 1.5, LATER)).toBe(tasks)
  })
})

describe('inbox and active', () => {
  it('moves a task between inbox and active', () => {
    const task = makeTask({ status: 'inbox' })
    const activated = moveTaskBetweenInboxAndActive(
      [task],
      task.id,
      'active',
      LATER,
    )
    expect(activated[0].status).toBe('active')

    const parked = moveTaskBetweenInboxAndActive(
      activated,
      task.id,
      'inbox',
      LATER,
    )
    expect(parked[0].status).toBe('inbox')
  })

  it('does not move done or archived tasks', () => {
    const done = makeTask({ status: 'done', completedAt: NOW })
    expect(
      moveTaskBetweenInboxAndActive([done], done.id, 'active', LATER),
    ).toEqual([done])
  })
})

describe('completion, reopen and archive', () => {
  it('completes a task with completedAt from the caller clock', () => {
    const task = makeTask()
    const [completed] = completeTaskInList([task], task.id, LATER)

    expect(completed.status).toBe('done')
    expect(completed.completedAt).toBe(LATER)
    expect(completed.updatedAt).toBe(LATER)
  })

  it('reopens a done task and clears completedAt', () => {
    const task = makeTask({ status: 'done', completedAt: NOW })
    const [reopened] = reopenTaskInList([task], task.id, LATER)

    expect(reopened.status).toBe('active')
    expect(reopened.completedAt).toBeNull()
  })

  it('archives a task', () => {
    const task = makeTask()
    const [archived] = archiveTaskInList([task], task.id, LATER)

    expect(archived.status).toBe('archived')
  })
})

describe('ordering and selectors', () => {
  it('sorts by position and lists inbox plus active', () => {
    const tasks = [
      makeTask({ id: 'b', title: 'B', position: 2, status: 'active' }),
      makeTask({ id: 'a', title: 'A', position: 0, status: 'inbox' }),
      makeTask({
        id: 'c',
        title: 'C',
        position: 1,
        status: 'done',
        completedAt: NOW,
      }),
      makeTask({ id: 'd', title: 'D', position: 3, status: 'archived' }),
    ]

    expect(sortTasksByPosition(tasks).map((task) => task.id)).toEqual([
      'a',
      'c',
      'b',
      'd',
    ])
    expect(tasksForCommonList(tasks).map((task) => task.id)).toEqual(['a', 'b'])
    expect(tasksByStatus(tasks, 'done')).toHaveLength(1)
  })

  it('reorders tasks by the given ids', () => {
    const tasks = [
      makeTask({ id: 'a', position: 0 }),
      makeTask({ id: 'b', position: 1 }),
      makeTask({ id: 'c', position: 2 }),
    ]
    const reordered = reorderTasksByIds(tasks, ['c', 'a', 'b'], LATER)

    expect(reordered.find((task) => task.id === 'c')?.position).toBe(0)
    expect(reordered.find((task) => task.id === 'a')?.position).toBe(1)
    expect(reordered.find((task) => task.id === 'b')?.position).toBe(2)
  })

  it('assigns the next position when adding a task', () => {
    const existing = [makeTask({ id: 'a', position: 4 })]
    const next = addTaskToList(existing, {
      id: 'b',
      title: 'Nova',
      now: NOW,
    })

    expect(next?.[1].position).toBe(5)
  })
})

describe('migrateLegacyTasks', () => {
  it('maps name to title and uses the fallback clock when createdAt is invalid', () => {
    const migrated = migrateLegacyTasks(
      [
        {
          id: 'keep-me',
          name: '  Projeto legado  ',
          createdAt: '2026-01-01T10:00:00.000Z',
        },
        {
          id: 'fallback',
          name: 'Sem data',
          createdAt: 'not-a-date',
        },
      ],
      NOW,
    )

    expect(migrated[0]).toMatchObject({
      id: 'keep-me',
      title: 'Projeto legado',
      status: 'active',
      nextAction: null,
      estimatedMinutes: null,
      energy: null,
      position: 0,
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
      completedAt: null,
    })
    expect(migrated[1]).toMatchObject({
      id: 'fallback',
      position: 1,
      createdAt: NOW,
      updatedAt: NOW,
    })
  })
})
