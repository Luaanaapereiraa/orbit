import type {
  UnlockTaskRunCompleted,
  UnlockTaskRunNeedsClarification,
  UnlockTaskRunRejected,
} from '@destravai/contracts'
import type { UnlockAgentError } from './api/unlock-agent-errors'
import type { UnlockFormFields } from './mappings'

export type SubmittedUnlockContext = {
  clientRequestId: string
  taskId: string
  taskTitle: string
  submittedAt: string
}

export type UnlockFieldErrors = Partial<
  Record<keyof UnlockFormFields, string>
>

type UnlockStateBase = {
  fields: UnlockFormFields
  submitted: SubmittedUnlockContext | null
}

export type UnlockDialogState =
  | (UnlockStateBase & {
      status: 'form'
      formError: UnlockAgentError | null
      fieldErrors: UnlockFieldErrors
    })
  | (UnlockStateBase & {
      status: 'submitting'
      submitted: SubmittedUnlockContext
    })
  | (UnlockStateBase & {
      status: 'completed'
      submitted: SubmittedUnlockContext
      response: UnlockTaskRunCompleted
      applied: boolean
    })
  | (UnlockStateBase & {
      status: 'needs_clarification'
      submitted: SubmittedUnlockContext
      response: UnlockTaskRunNeedsClarification
    })
  | (UnlockStateBase & {
      status: 'rejected'
      submitted: SubmittedUnlockContext
      response: UnlockTaskRunRejected
    })
  | (UnlockStateBase & {
      status: 'error'
      submitted: SubmittedUnlockContext | null
      error: UnlockAgentError
      retryAvailableAt: number | null
    })
  | (UnlockStateBase & {
      status: 'applied'
      submitted: SubmittedUnlockContext
      response: UnlockTaskRunCompleted
      appliedTaskId: string
    })
