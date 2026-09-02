import { z } from 'zod'
import {
  UnlockPlanSchema,
  UnlockTaskRunRejectionReasonSchema,
} from '@destravai/contracts'

export const EmptyArgsSchema = z.object({}).strict()

export const AgentStructuredOutputSchema = z
  .object({
    status: z.enum(['completed', 'needs_clarification', 'rejected']),
    plan: UnlockPlanSchema.optional(),
    question: z.string().trim().min(1).max(280).optional(),
    reason: UnlockTaskRunRejectionReasonSchema.optional(),
    message: z.string().trim().min(1).max(280).optional(),
  })
  .strict()

export const AgentOutputSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('completed'),
    plan: UnlockPlanSchema,
  }),
  z.object({
    status: z.literal('needs_clarification'),
    question: z.string().trim().min(1).max(280),
  }),
  z.object({
    status: z.literal('rejected'),
    reason: UnlockTaskRunRejectionReasonSchema,
    message: z.string().trim().min(1).max(280),
  }),
])

export type AgentOutput = z.infer<typeof AgentOutputSchema>
