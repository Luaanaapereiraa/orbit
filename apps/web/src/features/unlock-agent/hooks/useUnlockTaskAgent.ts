import { useEffect, useMemo, useReducer, useRef } from 'react'
import type { UnlockTaskRunResponse } from '@destravai/contracts'
import type { DailyPlan, Task } from '@destravai/core'
import { runUnlockTaskAgent } from '../api/unlock-agent-client'
import {
  UnlockAgentError,
  unlockAgentErrorFromUnknown,
} from '../api/unlock-agent-errors'
import {
  buildUnlockTaskRequest,
  createUnlockFormFields,
  fieldErrorsFromDetails,
  type UnlockFormFields,
} from '../mappings'
import type {
  SubmittedUnlockContext,
  UnlockDialogState,
  UnlockFieldErrors,
} from '../types'

export const UNLOCK_RETRY_COOLDOWN_MS = 1500

type Action =
  | { type: 'reset'; fields: UnlockFormFields }
  | { type: 'patch'; fields: Partial<UnlockFormFields>; refreshId?: boolean }
  | { type: 'submitting'; fields: UnlockFormFields; submitted: SubmittedUnlockContext }
  | {
      type: 'completed'
      response: Extract<UnlockTaskRunResponse, { status: 'completed' }>
    }
  | {
      type: 'needs_clarification'
      response: Extract<
        UnlockTaskRunResponse,
        { status: 'needs_clarification' }
      >
    }
  | {
      type: 'rejected'
      response: Extract<UnlockTaskRunResponse, { status: 'rejected' }>
    }
  | {
      type: 'error'
      error: UnlockAgentError
      retryAvailableAt: number | null
    }
  | { type: 'formValidation'; error: UnlockAgentError; fieldErrors: UnlockFieldErrors }
  | { type: 'applied'; taskId: string }
  | { type: 'backToForm'; newRequestId?: boolean }

function emptyForm(
  fields: UnlockFormFields,
  extras?: {
    formError?: UnlockAgentError | null
    fieldErrors?: UnlockFieldErrors
  },
): UnlockDialogState {
  return {
    status: 'form',
    fields,
    submitted: null,
    formError: extras?.formError ?? null,
    fieldErrors: extras?.fieldErrors ?? {},
  }
}

function reducer(state: UnlockDialogState, action: Action): UnlockDialogState {
  switch (action.type) {
    case 'reset':
      return emptyForm(action.fields)
    case 'patch': {
      const bodyChangedAfterValidation =
        state.status === 'form' &&
        (!!state.formError || Object.keys(state.fieldErrors).length > 0)
      const fields = {
        ...state.fields,
        ...action.fields,
        clientRequestId:
          action.refreshId || bodyChangedAfterValidation
            ? crypto.randomUUID()
            : state.fields.clientRequestId,
      }
      if (state.status === 'form' || state.status === 'error') {
        return emptyForm(fields)
      }
      if (
        action.fields.taskId &&
        action.fields.taskId !== state.fields.taskId &&
        (state.status === 'completed' ||
          state.status === 'applied' ||
          state.status === 'needs_clarification' ||
          state.status === 'rejected')
      ) {
        return emptyForm({
          ...fields,
          clientRequestId: crypto.randomUUID(),
        })
      }
      return { ...state, fields }
    }
    case 'submitting':
      return {
        status: 'submitting',
        fields: action.fields,
        submitted: action.submitted,
      }
    case 'completed':
      if (!state.submitted) {
        return state
      }
      return {
        status: 'completed',
        fields: state.fields,
        submitted: state.submitted,
        response: action.response,
        applied: false,
      }
    case 'needs_clarification':
      if (!state.submitted) {
        return state
      }
      return {
        status: 'needs_clarification',
        fields: state.fields,
        submitted: state.submitted,
        response: action.response,
      }
    case 'rejected':
      if (!state.submitted) {
        return state
      }
      return {
        status: 'rejected',
        fields: state.fields,
        submitted: state.submitted,
        response: action.response,
      }
    case 'error':
      return {
        status: 'error',
        fields: state.fields,
        submitted: state.submitted,
        error: action.error,
        retryAvailableAt: action.retryAvailableAt,
      }
    case 'formValidation':
      return emptyForm(state.fields, {
        formError: action.error,
        fieldErrors: action.fieldErrors,
      })
    case 'applied':
      if (state.status !== 'completed' || !state.submitted) {
        return state
      }
      if (state.submitted.taskId !== action.taskId) {
        return state
      }
      return {
        status: 'applied',
        fields: state.fields,
        submitted: state.submitted,
        response: state.response,
        appliedTaskId: action.taskId,
      }
    case 'backToForm':
      return emptyForm({
        ...state.fields,
        clientRequestId: action.newRequestId
          ? crypto.randomUUID()
          : state.fields.clientRequestId,
      })
    default:
      return state
  }
}

export function useUnlockTaskAgent(input: {
  initialTaskId: string
  availableMinutes: number
  run?: typeof runUnlockTaskAgent
  now?: () => number
  retryCooldownMs?: number
}) {
  const [state, dispatch] = useReducer(
    reducer,
    createUnlockFormFields(input.initialTaskId, input.availableMinutes),
    (fields) => emptyForm(fields),
  )
  const stateRef = useRef(state)
  stateRef.current = state
  const requestGenerationRef = useRef(0)
  const inFlightRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const activeRequestRef = useRef<{
    generation: number
    controller: AbortController
    clientRequestId: string
  } | null>(null)
  const run = input.run ?? runUnlockTaskAgent
  const now = input.now ?? Date.now
  const retryCooldownMs = input.retryCooldownMs ?? UNLOCK_RETRY_COOLDOWN_MS

  useEffect(() => {
    return () => {
      requestGenerationRef.current += 1
      abortRef.current?.abort()
      abortRef.current = null
      activeRequestRef.current = null
      inFlightRef.current = false
    }
  }, [])

  const actions = useMemo(() => {
    function isCurrent(generation: number) {
      return activeRequestRef.current?.generation === generation
    }

    function patchFields(
      fields: Partial<UnlockFormFields>,
      refreshId = stateRef.current.status !== 'form',
    ) {
      dispatch({ type: 'patch', fields, refreshId })
    }

    async function submit(
      task: Task,
      dateKey: string,
      dailyPlans: readonly DailyPlan[],
      getAccessToken: () => Promise<string | null>,
      extraDetails?: string,
    ) {
      const current = stateRef.current
      const fields =
        extraDetails !== undefined
          ? {
              ...current.fields,
              blockageDetails: extraDetails,
              clientRequestId: crypto.randomUUID(),
            }
          : current.fields

      if (
        inFlightRef.current &&
        activeRequestRef.current?.clientRequestId === fields.clientRequestId
      ) {
        return
      }
      inFlightRef.current = true

      const submitted: SubmittedUnlockContext = {
        clientRequestId: fields.clientRequestId,
        taskId: task.id,
        taskTitle: task.title,
        submittedAt: new Date(now()).toISOString(),
      }

      const generation = ++requestGenerationRef.current
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      activeRequestRef.current = {
        generation,
        controller,
        clientRequestId: submitted.clientRequestId,
      }

      dispatch({ type: 'submitting', fields, submitted })

      try {
        let request
        try {
          request = buildUnlockTaskRequest({
            fields,
            task,
            dateKey,
            dailyPlans,
          })
        } catch (caught) {
          if (!isCurrent(generation)) {
            return
          }
          const error =
            caught instanceof UnlockAgentError
              ? caught
              : new UnlockAgentError(
                  'validation',
                  caught instanceof Error
                    ? caught.message
                    : 'Alguns dados do pedido não são válidos. Revise o formulário.',
                )
          dispatch({
            type: 'formValidation',
            error,
            fieldErrors: fieldErrorsFromDetails(error.details),
          })
          return
        }

        const token = await getAccessToken()
        if (!isCurrent(generation)) {
          return
        }
        if (!token) {
          dispatch({
            type: 'error',
            error: new UnlockAgentError(
              'unauthenticated',
              'Entre de novo para pedir ajuda. Seu planner continua no mesmo lugar.',
              { status: 401 },
            ),
            retryAvailableAt: null,
          })
          return
        }

        const response = await run(request, token, {
          signal: controller.signal,
        })
        if (!isCurrent(generation)) {
          return
        }
        if (response.status === 'completed') {
          dispatch({ type: 'completed', response })
          return
        }
        if (response.status === 'needs_clarification') {
          dispatch({ type: 'needs_clarification', response })
          return
        }
        dispatch({ type: 'rejected', response })
      } catch (caught) {
        if (!isCurrent(generation)) {
          return
        }
        if (controller.signal.aborted) {
          return
        }
        const error = unlockAgentErrorFromUnknown(caught)
        if (error.code === 'validation' && error.status === 400) {
          dispatch({
            type: 'formValidation',
            error,
            fieldErrors: fieldErrorsFromDetails(error.details),
          })
          return
        }
        dispatch({
          type: 'error',
          error,
          retryAvailableAt:
            error.status === 409 ? now() + retryCooldownMs : null,
        })
      } finally {
        if (isCurrent(generation)) {
          inFlightRef.current = false
          activeRequestRef.current = null
        }
      }
    }

    function cancelWait() {
      requestGenerationRef.current += 1
      abortRef.current?.abort()
      abortRef.current = null
      activeRequestRef.current = null
      inFlightRef.current = false
    }

    return {
      patchFields,
      submit,
      cancelWait,
      markApplied: (taskId: string) => dispatch({ type: 'applied', taskId }),
      backToForm: (newRequestId = true) =>
        dispatch({ type: 'backToForm', newRequestId }),
      reset: (taskId: string, availableMinutes: number) =>
        dispatch({
          type: 'reset',
          fields: createUnlockFormFields(taskId, availableMinutes),
        }),
    }
  }, [now, retryCooldownMs, run])

  return { state, ...actions }
}
