import { UnlockTaskRunRequestSchema } from '@destravai/contracts'
import { z } from 'zod'
import type { ApiErrorDetail } from './app-error.js'

export function zodDetails(error: z.ZodError): ApiErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '$',
    message: issue.message,
  }))
}

export function parseUnlockTaskRunRequest(input: unknown) {
  return UnlockTaskRunRequestSchema.safeParse(input)
}
