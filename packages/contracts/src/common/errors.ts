import { z } from 'zod'
import { publicErrorMap } from './zod'
import { publicObject } from './zod'

export const ApiErrorDetailSchema = publicObject({
  path: z.string({ errorMap: publicErrorMap }).min(1),
  message: z.string({ errorMap: publicErrorMap }).min(1),
})

export const ApiErrorResponseSchema = publicObject({
  error: publicObject({
    code: z.string({ errorMap: publicErrorMap }).min(1),
    message: z.string({ errorMap: publicErrorMap }).min(1),
    requestId: z.string({ errorMap: publicErrorMap }).min(1),
    details: z.array(ApiErrorDetailSchema).optional(),
  }),
})

export type ApiErrorDetail = z.infer<typeof ApiErrorDetailSchema>
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>
