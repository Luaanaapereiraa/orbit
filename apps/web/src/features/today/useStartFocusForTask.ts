'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import {
  usePomodoro,
  type StartFocusResult,
} from '../../contexts/PomodoroContext'

export function useStartFocusForTask() {
  const { startFocusForTask } = usePomodoro()
  const router = useRouter()

  return useCallback(
    (taskId: string): StartFocusResult => {
      const result = startFocusForTask(taskId)

      if (
        result.status === 'task_not_found' ||
        result.status === 'task_not_eligible' ||
        result.status === 'start_in_progress'
      ) {
        return result
      }

      router.push('/focus')
      return result
    },
    [router, startFocusForTask],
  )
}
