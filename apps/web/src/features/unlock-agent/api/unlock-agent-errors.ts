import { ApiErrorResponseSchema } from '@destravai/contracts'

export type UnlockAgentErrorCode =
  | 'unauthenticated'
  | 'validation'
  | 'in_progress'
  | 'quota_exceeded'
  | 'provider_error'
  | 'temporarily_unavailable'
  | 'timeout'
  | 'network'
  | 'invalid_response'
  | 'unknown'

export class UnlockAgentError extends Error {
  readonly code: UnlockAgentErrorCode
  readonly status: number | null
  readonly retryable: boolean
  readonly sameRequest: boolean

  constructor(
    code: UnlockAgentErrorCode,
    message: string,
    options?: {
      status?: number | null
      retryable?: boolean
      sameRequest?: boolean
    },
  ) {
    super(message)
    this.name = 'UnlockAgentError'
    this.code = code
    this.status = options?.status ?? null
    this.retryable = options?.retryable ?? false
    this.sameRequest = options?.sameRequest ?? false
  }
}

const STATUS_MAP: Record<
  number,
  {
    code: UnlockAgentErrorCode
    message: string
    retryable: boolean
    sameRequest: boolean
  }
> = {
  401: {
    code: 'unauthenticated',
    message:
      'Entre de novo para pedir ajuda. Seu planner continua no mesmo lugar.',
    retryable: false,
    sameRequest: false,
  },
  400: {
    code: 'validation',
    message: 'Alguns dados do pedido não são válidos. Revise o formulário.',
    retryable: false,
    sameRequest: false,
  },
  409: {
    code: 'in_progress',
    message:
      'Esta solicitação ainda está sendo processada. Você pode consultar de novo o mesmo pedido.',
    retryable: true,
    sameRequest: true,
  },
  429: {
    code: 'quota_exceeded',
    message: 'Você já usou o limite diário de ajuda. Volte amanhã.',
    retryable: false,
    sameRequest: false,
  },
  502: {
    code: 'provider_error',
    message:
      'O assistente não conseguiu concluir agora. Tente de novo em instantes.',
    retryable: true,
    sameRequest: false,
  },
  503: {
    code: 'temporarily_unavailable',
    message:
      'A ajuda está indisponível no momento. Tente de novo daqui a pouco.',
    retryable: true,
    sameRequest: false,
  },
  504: {
    code: 'timeout',
    message: 'A ajuda demorou demais. Você pode tentar de novo o mesmo pedido.',
    retryable: true,
    sameRequest: true,
  },
}

export function unlockAgentErrorFromResponse(
  status: number,
  raw: unknown,
): UnlockAgentError {
  const mapped = STATUS_MAP[status]
  const parsed = ApiErrorResponseSchema.safeParse(raw)
  const apiCode = parsed.success ? parsed.data.error.code : null

  if (apiCode === 'AGENT_QUOTA_EXCEEDED' || apiCode === 'RATE_LIMITED') {
    return new UnlockAgentError('quota_exceeded', STATUS_MAP[429].message, {
      status,
      retryable: false,
      sameRequest: false,
    })
  }

  if (mapped) {
    return new UnlockAgentError(mapped.code, mapped.message, {
      status,
      retryable: mapped.retryable,
      sameRequest: mapped.sameRequest,
    })
  }

  return new UnlockAgentError(
    'unknown',
    'Não foi possível pedir ajuda agora.',
    { status, retryable: true, sameRequest: false },
  )
}

export function unlockAgentErrorFromUnknown(caught: unknown): UnlockAgentError {
  if (caught instanceof UnlockAgentError) {
    return caught
  }

  if (caught instanceof DOMException && caught.name === 'AbortError') {
    return new UnlockAgentError(
      'timeout',
      'A espera foi cancelada ou o pedido demorou demais.',
      { retryable: true, sameRequest: true },
    )
  }

  if (caught instanceof TypeError) {
    return new UnlockAgentError(
      'network',
      'Sem conexão agora. Seu formulário foi mantido para tentar de novo.',
      { retryable: true, sameRequest: true },
    )
  }

  return new UnlockAgentError(
    'unknown',
    'Não foi possível pedir ajuda agora.',
    { retryable: true, sameRequest: false },
  )
}
