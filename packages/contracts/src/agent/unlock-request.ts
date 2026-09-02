import { z } from 'zod'
import { NullableEnergyLevelSchema } from '../common/energy'
import { UuidSchema } from '../common/ids'
import {
  BLOCKAGE_DETAILS_MAX_LENGTH,
  MAX_AVAILABLE_MINUTES,
  MIN_AVAILABLE_MINUTES,
} from '../common/limits'
import { SupportedLocaleSchema } from '../common/locale'
import { publicErrorMap } from '../common/zod'
import { publicObject } from '../common/zod'
import { BlockageReasonSchema } from './blockage'
import { AgentTaskContextSchema } from './task-context'
import { TodayPlanContextSchema } from './today-plan'

export const UnlockTaskRunRequestSchema = publicObject({
  clientRequestId: UuidSchema,
  task: AgentTaskContextSchema,
  blockageReason: BlockageReasonSchema,
  blockageDetails: z
    .string({ errorMap: publicErrorMap })
    .trim()
    .min(1)
    .max(BLOCKAGE_DETAILS_MAX_LENGTH)
    .nullable(),
  availableMinutes: z
    .number({ errorMap: publicErrorMap })
    .int()
    .min(MIN_AVAILABLE_MINUTES)
    .max(MAX_AVAILABLE_MINUTES),
  currentEnergy: NullableEnergyLevelSchema,
  today: TodayPlanContextSchema,
  locale: SupportedLocaleSchema,
})

export type UnlockTaskRunRequest = z.infer<typeof UnlockTaskRunRequestSchema>
