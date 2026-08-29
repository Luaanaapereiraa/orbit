import {
  ApiErrorResponseSchema,
  UnlockTaskRunRequestSchema,
  UnlockTaskRunResponseSchema,
} from '@destravai/contracts'
import { NextResponse } from 'next/server'
import { readDestravaiApiUrl } from '../../../../../lib/server-env'

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 45_000
const NO_STORE = { 'Cache-Control': 'no-store' }

function safeError(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        requestId: 'web-proxy',
      },
    },
    { status, headers: NO_STORE },
  )
}

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization')
  const accessToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : ''
  if (!accessToken) {
    return safeError(
      401,
      'UNAUTHORIZED',
      'Entre na sua conta para pedir ajuda.',
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return safeError(400, 'VALIDATION_ERROR', 'O pedido não é válido.')
  }

  const parsed = UnlockTaskRunRequestSchema.safeParse(body)
  if (!parsed.success) {
    return safeError(
      400,
      'VALIDATION_ERROR',
      'Alguns dados do pedido não são válidos.',
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let apiUrl: string
  try {
    apiUrl = readDestravaiApiUrl()
  } catch {
    return safeError(
      503,
      'SERVICE_UNAVAILABLE',
      'A ajuda está indisponível no momento.',
    )
  }

  try {
    const upstream = await fetch(`${apiUrl}/v1/agents/unlock-task/runs`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
      signal: controller.signal,
    })

    const raw: unknown = await upstream.json().catch(() => null)

    if (upstream.ok) {
      const response = UnlockTaskRunResponseSchema.safeParse(raw)
      if (!response.success) {
        return safeError(
          502,
          'BAD_GATEWAY',
          'A ajuda falhou agora. Tente de novo em instantes.',
        )
      }

      return NextResponse.json(response.data, {
        status: upstream.status,
        headers: NO_STORE,
      })
    }

    const errorBody = ApiErrorResponseSchema.safeParse(raw)
    if (errorBody.success) {
      return NextResponse.json(errorBody.data, {
        status: upstream.status,
        headers: NO_STORE,
      })
    }

    const status =
      upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502
    return safeError(
      status,
      'BAD_GATEWAY',
      'Não foi possível pedir ajuda agora.',
    )
  } catch (caught) {
    if (caught instanceof Error && caught.name === 'AbortError') {
      return safeError(
        504,
        'GATEWAY_TIMEOUT',
        'A ajuda demorou demais. Tente de novo.',
      )
    }
    return safeError(
      503,
      'SERVICE_UNAVAILABLE',
      'A ajuda está indisponível no momento.',
    )
  } finally {
    clearTimeout(timer)
  }
}
