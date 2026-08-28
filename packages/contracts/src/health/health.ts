import { z } from 'zod'
import { IsoTimestampSchema } from '../common/dates'
import { publicErrorMap } from '../common/zod'
import { publicObject } from '../common/zod'

export const HealthStatusSchema = z.enum(['ok', 'ready'], {
  errorMap: publicErrorMap,
})

export const HealthResponseSchema = publicObject({
  status: HealthStatusSchema,
  service: z.string({ errorMap: publicErrorMap }).min(1),
  version: z.string({ errorMap: publicErrorMap }).min(1),
  timestamp: IsoTimestampSchema,
  requestId: z.string({ errorMap: publicErrorMap }).min(1),
})

export type HealthStatus = z.infer<typeof HealthStatusSchema>
export type HealthResponse = z.infer<typeof HealthResponseSchema>
