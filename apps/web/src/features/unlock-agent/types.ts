import type {
  UnlockTaskRunCompleted,
  UnlockTaskRunNeedsClarification,
  UnlockTaskRunRejected,
} from '@destravai/contracts'
import type { UnlockAgentError } from './api/unlock-agent-errors'
import type { UnlockFormFields } from './mappings'

export type UnlockDialogState =
  | { status: 'form'; fields: UnlockFormFields }
  | { status: 'submitting'; fields: UnlockFormFields }
  | {
      status: 'completed'
      fields: UnlockFormFields
      response: UnlockTaskRunCompleted
      applied: boolean
    }
  | {
      status: 'needs_clarification'
      fields: UnlockFormFields
      response: UnlockTaskRunNeedsClarification
    }
  | {
      status: 'rejected'
      fields: UnlockFormFields
      response: UnlockTaskRunRejected
    }
  | {
      status: 'error'
      fields: UnlockFormFields
      error: UnlockAgentError
    }
  | {
      status: 'applied'
      fields: UnlockFormFields
      response: UnlockTaskRunCompleted
    }
