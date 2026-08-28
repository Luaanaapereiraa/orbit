import { z } from 'zod'
import { publicErrorMap } from './zod'
import { publicObject } from './zod'

export const MeResponseSchema = publicObject({
  user: publicObject({
    id: z.string({ errorMap: publicErrorMap }).min(1),
    isAnonymous: z.boolean({ errorMap: publicErrorMap }),
  }),
})

export type MeResponse = z.infer<typeof MeResponseSchema>
