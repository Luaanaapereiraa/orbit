import { z } from 'zod'
import { IsoTimestampSchema } from '../common/dates'
import { UuidSchema } from '../common/ids'
import {
  CLARIFICATION_QUESTION_MAX_LENGTH,
  PROMPT_VERSION_MAX_LENGTH,
  REJECTED_MESSAGE_MAX_LENGTH,
} from '../common/limits'
import { publicErrorMap } from '../common/zod'
import { publicObject } from '../common/zod'
import { UnlockPlanSchema } from './unlock-plan'

const PromptVersionSchema = z
  .string({ errorMap: publicErrorMap })
  .min(1)
  .max(PROMPT_VERSION_MAX_LENGTH)

export const UnlockTaskRunRejectionReasonSchema = z.enum(
  ['safety', 'unsafe_input', 'unsupported_request'],
  { errorMap: publicErrorMap },
)

export const GenerationModeSchema = z.enum(['agent', 'fallback'], {
  errorMap: publicErrorMap,
})

export const UnlockTaskRunCompletedSchema = publicObject({
  runId: UuidSchema,
  status: z.literal('completed', { errorMap: publicErrorMap }),
  plan: UnlockPlanSchema,
  promptVersion: PromptVersionSchema,
  generationMode: GenerationModeSchema,
  createdAt: IsoTimestampSchema,
})

export const UnlockTaskRunNeedsClarificationSchema = publicObject({
  runId: UuidSchema,
  status: z.literal('needs_clarification', { errorMap: publicErrorMap }),
  question: z
    .string({ errorMap: publicErrorMap })
    .trim()
    .min(1)
    .max(CLARIFICATION_QUESTION_MAX_LENGTH),
  promptVersion: PromptVersionSchema,
  createdAt: IsoTimestampSchema,
})

export const UnlockTaskRunRejectedSchema = publicObject({
  runId: UuidSchema,
  status: z.literal('rejected', { errorMap: publicErrorMap }),
  reason: UnlockTaskRunRejectionReasonSchema,
  message: z
    .string({ errorMap: publicErrorMap })
    .trim()
    .min(1)
    .max(REJECTED_MESSAGE_MAX_LENGTH),
  promptVersion: PromptVersionSchema,
  createdAt: IsoTimestampSchema,
})

export const UnlockTaskRunResponseSchema = z.discriminatedUnion(
  'status',
  [
    UnlockTaskRunCompletedSchema,
    UnlockTaskRunNeedsClarificationSchema,
    UnlockTaskRunRejectedSchema,
  ],
  { errorMap: publicErrorMap },
)

export type GenerationMode = z.infer<typeof GenerationModeSchema>
export type UnlockTaskRunRejectionReason = z.infer<
  typeof UnlockTaskRunRejectionReasonSchema
>
export type UnlockTaskRunCompleted = z.infer<typeof UnlockTaskRunCompletedSchema>
export type UnlockTaskRunNeedsClarification = z.infer<
  typeof UnlockTaskRunNeedsClarificationSchema
>
export type UnlockTaskRunRejected = z.infer<typeof UnlockTaskRunRejectedSchema>
export type UnlockTaskRunResponse = z.infer<typeof UnlockTaskRunResponseSchema>
