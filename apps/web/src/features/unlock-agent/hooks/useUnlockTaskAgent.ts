import { useMemo, useReducer, useRef } from 'react'
import type {
  UnlockTaskRunRequest,
  UnlockTaskRunResponse,
} from '@destravai/contracts'
import type { DailyPlan, Task } from '@destravai/core'
import { runUnlockTaskAgent } from '../api/unlock-agent-client'
import {
  UnlockAgentError,
  unlockAgentErrorFromUnknown,
} from '../api/unlock-agent-errors'
import {
  buildUnlockTaskRequest,
  createUnlockFormFields,
  type UnlockFormFields,
} from '../mappings'
import type { UnlockDialogState } from '../types'

type Action =
  | { type: 'reset'; fields: UnlockFormFields }
  | { type: 'patch'; fields: Partial<UnlockFormFields>; refreshId?: boolean }
  | { type: 'submitting' }
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
  | { type: 'error'; error: UnlockAgentError }
  | { type: 'applied' }
  | { type: 'backToForm'; newRequestId?: boolean }

function reducer(state: UnlockDialogState, action: Action): UnlockDialogState {
  switch (action.type) {
    case 'reset':
      return { status: 'form', fields: action.fields }
    case 'patch': {
      const fields = {
        ...state.fields,
        ...action.fields,
        clientRequestId: action.refreshId
          ? crypto.randomUUID()
          : state.fields.clientRequestId,
      }
      if (state.status === 'form' || state.status === 'error') {
        return { status: 'form', fields }
      }
      return { ...state, fields }
    }
    case 'submitting':
      return { status: 'submitting', fields: state.fields }
    case 'completed':
      return {
        status: 'completed',
        fields: state.fields,
        response: action.response,
        applied: false,
      }
    case 'needs_clarification':
      return {
        status: 'needs_clarification',
        fields: state.fields,
        response: action.response,
      }
    case 'rejected':
      return {
        status: 'rejected',
        fields: state.fields,
        response: action.response,
      }
    case 'error':
      return { status: 'error', fields: state.fields, error: action.error }
    case 'applied':
      if (state.status !== 'completed') {
        return state
      }
      return {
        status: 'applied',
        fields: state.fields,
        response: state.response,
      }
    case 'backToForm':
      return {
        status: 'form',
        fields: {
          ...state.fields,
          clientRequestId: action.newRequestId
            ? crypto.randomUUID()
            : state.fields.clientRequestId,
        },
      }
    default:
      return state
  }
}

export function useUnlockTaskAgent(input: {
  initialTaskId: string
  availableMinutes: number
  run?: typeof runUnlockTaskAgent
}) {
  const [state, dispatch] = useReducer(
    reducer,
    createUnlockFormFields(input.initialTaskId, input.availableMinutes),
    (fields) => ({ status: 'form' as const, fields }),
  )
  const abortRef = useRef<AbortController | null>(null)
  const run = input.run ?? runUnlockTaskAgent

  const actions = useMemo(() => {
    function patchFields(
      fields: Partial<UnlockFormFields>,
      refreshId = state.status !== 'form',
    ) {
      dispatch({ type: 'patch', fields, refreshId })
    }

    async function submit(
      task: Task,
      dateKey: string,
      dailyPlans: readonly DailyPlan[],
      accessToken: string,
      extraDetails?: string,
    ) {
      if (state.status === 'submitting') {
        return
      }

      const fields =
        extraDetails !== undefined
          ? {
              ...state.fields,
              blockageDetails: extraDetails,
              clientRequestId: crypto.randomUUID(),
            }
          : state.fields

      if (extraDetails !== undefined) {
        dispatch({
          type: 'patch',
          fields: {
            blockageDetails: extraDetails,
            clientRequestId: fields.clientRequestId,
          },
          refreshId: false,
        })
      }

      let request: UnlockTaskRunRequest
      try {
        request = buildUnlockTaskRequest({
          fields,
          task,
          dateKey,
          dailyPlans,
        })
      } catch (caught) {
        dispatch({
          type: 'error',
          error:
            caught instanceof UnlockAgentError
              ? caught
              : new UnlockAgentError(
                  'validation',
                  caught instanceof Error
                    ? caught.message
                    : 'Alguns dados do pedido não são válidos. Revise o formulário.',
                ),
        })
        return
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      dispatch({ type: 'submitting' })

      try {
        const response = await run(request, accessToken, {
          signal: controller.signal,
        })
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
        if (controller.signal.aborted) {
          dispatch({ type: 'backToForm', newRequestId: false })
          return
        }
        dispatch({
          type: 'error',
          error: unlockAgentErrorFromUnknown(caught),
        })
      }
    }

    function cancelWait() {
      abortRef.current?.abort()
      abortRef.current = null
    }

    return {
      patchFields,
      submit,
      cancelWait,
      markApplied: () => dispatch({ type: 'applied' }),
      backToForm: (newRequestId = true) =>
        dispatch({ type: 'backToForm', newRequestId }),
      reset: (taskId: string, availableMinutes: number) =>
        dispatch({
          type: 'reset',
          fields: createUnlockFormFields(taskId, availableMinutes),
        }),
    }
  }, [run, state.fields, state.status])

  return { state, ...actions }
}
