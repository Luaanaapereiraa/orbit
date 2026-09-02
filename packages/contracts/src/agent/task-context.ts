import { z } from 'zod'
import { NullableEnergyLevelSchema } from '../common/energy'
import {
  NEXT_ACTION_MAX_LENGTH,
  TASK_ID_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from '../common/limits'
import { publicErrorMap } from '../common/zod'
import { publicObject } from '../common/zod'

export const AgentTaskStatusSchema = z.enum(['inbox', 'active'], {
  errorMap: publicErrorMap,
})

export const AgentTaskContextSchema = publicObject({
  id: z.string({ errorMap: publicErrorMap }).min(1).max(TASK_ID_MAX_LENGTH),
  title: z.string({ errorMap: publicErrorMap }).trim().min(1).max(TITLE_MAX_LENGTH),
  nextAction: z
    .string({ errorMap: publicErrorMap })
    .trim()
    .min(1)
    .max(NEXT_ACTION_MAX_LENGTH)
    .nullable(),
  energy: NullableEnergyLevelSchema,
  estimatedMinutes: z
    .number({ errorMap: publicErrorMap })
    .int()
    .positive()
    .nullable(),
  status: AgentTaskStatusSchema,
})

export type AgentTaskStatus = z.infer<typeof AgentTaskStatusSchema>
export type AgentTaskContext = z.infer<typeof AgentTaskContextSchema>
