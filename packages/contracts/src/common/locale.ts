import { z } from 'zod'
import { publicErrorMap } from './zod'

export const SupportedLocaleSchema = z.enum(['pt-BR', 'en-US'], {
  errorMap: publicErrorMap,
})

export type SupportedLocale = z.infer<typeof SupportedLocaleSchema>
