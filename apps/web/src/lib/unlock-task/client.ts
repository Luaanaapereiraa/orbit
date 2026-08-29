import {
  ApiErrorResponseSchema,
  UnlockTaskRunResponseSchema,
  type UnlockTaskRunRequest,
  type UnlockTaskRunResponse,
} from '@destravai/contracts'
import { readPublicApiUrl } from '../public-env'

export class UnlockTaskApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string | null

  constructor(
    status: number,
    code: string,
    message: string,
    requestId: string | null,
  ) {
    super(message)
    this.name = 'UnlockTaskApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

const FRIENDLY_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Entre na sua conta para pedir ajuda.',
  CONFLICT:
    'Já existe uma ajuda em andamento para este pedido. Espere um pouco e tente de novo.',
  AGENT_QUOTA_EXCEEDED: 'Você já usou o limite diário de ajuda. Volte amanhã.',
  RATE_LIMITED: 'Muitas tentativas seguidas. Espere um minuto.',
  BAD_GATEWAY: 'A ajuda falhou agora. Tente de novo em instantes.',
  AGENT_MAX_TURNS_EXCEEDED:
    'A ajuda não conseguiu fechar um plano. Tente de novo.',
  SERVICE_UNAVAILABLE: 'A ajuda está indisponível no momento.',
  GATEWAY_TIMEOUT: 'A ajuda demorou demais. Tente de novo.',
  VALIDATION_ERROR: 'Alguns dados do pedido não são válidos.',
}

export function messageForUnlockError(error: UnlockTaskApiError) {
  return FRIENDLY_MESSAGES[error.code] ?? 'Não foi possível pedir ajuda agora.'
}

type UnlockTaskFetch = (
  input: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
  },
) => Promise<Response>

export async function requestUnlockTaskRun(
  request: UnlockTaskRunRequest,
  accessToken: string,
  fetchImpl: UnlockTaskFetch = (input, init) => fetch(input, init),
): Promise<UnlockTaskRunResponse> {
  const response = await fetchImpl(
    `${readPublicApiUrl()}/v1/agents/unlock-task/runs`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  )

  const raw: unknown = await response.json().catch(() => null)

  if (response.ok) {
    const parsed = UnlockTaskRunResponseSchema.safeParse(raw)
    if (!parsed.success) {
      throw new UnlockTaskApiError(
        response.status,
        'BAD_GATEWAY',
        FRIENDLY_MESSAGES.BAD_GATEWAY,
        null,
      )
    }
    return parsed.data
  }

  const errorBody = ApiErrorResponseSchema.safeParse(raw)
  const code = errorBody.success ? errorBody.data.error.code : 'INTERNAL_ERROR'
  const requestId = errorBody.success ? errorBody.data.error.requestId : null
  throw new UnlockTaskApiError(
    response.status,
    code,
    FRIENDLY_MESSAGES[code] ?? 'Não foi possível pedir ajuda agora.',
    requestId,
  )
}
