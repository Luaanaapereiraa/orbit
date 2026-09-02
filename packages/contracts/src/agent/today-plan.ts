import { z } from 'zod'
import { LocalDateKeySchema } from '../common/dates'
import {
  MAX_PLANNED_TASK_COUNT,
  MIN_PLANNED_TASK_COUNT,
} from '../common/limits'
import { publicErrorMap } from '../common/zod'
import { publicObject } from '../common/zod'

export const TodayPlanRoleSchema = z.enum(
  ['essential', 'secondary', 'unplanned'],
  { errorMap: publicErrorMap },
)

export const TodayPlanContextSchema = publicObject({
  date: LocalDateKeySchema,
  role: TodayPlanRoleSchema,
  plannedTaskCount: z
    .number({ errorMap: publicErrorMap })
    .int()
    .min(MIN_PLANNED_TASK_COUNT)
    .max(MAX_PLANNED_TASK_COUNT),
})

export type TodayPlanRole = z.infer<typeof TodayPlanRoleSchema>
export type TodayPlanContext = z.infer<typeof TodayPlanContextSchema>
