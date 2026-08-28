import { z } from 'zod'
import {
  UnlockPlanSchema,
  UnlockTaskRunRejectionReasonSchema,
} from '@destravai/contracts'

export const EmptyArgsSchema = z.object({}).strict()

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
