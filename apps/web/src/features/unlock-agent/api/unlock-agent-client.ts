import {
  UnlockTaskRunRequestSchema,
  UnlockTaskRunResponseSchema,
  type UnlockTaskRunRequest,
  type UnlockTaskRunResponse,
} from '@destravai/contracts'
import {
  UnlockAgentError,
  unlockAgentErrorFromResponse,
  unlockAgentErrorFromUnknown,
} from './unlock-agent-errors'

const UNLOCK_TASK_PATH = '/api/agents/unlock-task/runs'

type UnlockTaskFetch = (
  input: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
    signal?: AbortSignal
    cache?: RequestCache
    credentials?: RequestCredentials
  },
) => Promise<Response>

export async function runUnlockTaskAgent(
  request: UnlockTaskRunRequest,
  accessToken: string,
  options?: {
    signal?: AbortSignal
    fetchImpl?: UnlockTaskFetch
  },
): Promise<UnlockTaskRunResponse> {
  const parsed = UnlockTaskRunRequestSchema.safeParse(request)
  if (!parsed.success) {
    throw new UnlockAgentError(
      'validation',
      'Alguns dados do pedido não são válidos. Revise o formulário.',
    )
  }

  const fetchImpl = options?.fetchImpl ?? ((input, init) => fetch(input, init))

  let response: Response
  try {
    response = await fetchImpl(UNLOCK_TASK_PATH, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
      credentials: 'same-origin',
      signal: options?.signal,
    })
  } catch (caught) {
    throw unlockAgentErrorFromUnknown(caught)
  }

  const raw: unknown = await response.json().catch(() => null)

  if (response.ok) {
    const parsedResponse = UnlockTaskRunResponseSchema.safeParse(raw)
    if (!parsedResponse.success) {
      throw new UnlockAgentError(
        'invalid_response',
        'A ajuda respondeu de um jeito que não deu para usar.',
        { status: response.status },
      )
    }
    return parsedResponse.data
  }

  throw unlockAgentErrorFromResponse(response.status, raw)
}
