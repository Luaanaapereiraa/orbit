import { z } from 'zod'
import { publicErrorMap } from '../common/zod'

export const BlockageReasonSchema = z.enum(
  [
    'dont_know_where_to_start',
    'procrastinating',
    'low_energy',
    'overwhelmed',
    'other',
  ],
  { errorMap: publicErrorMap },
)

export type BlockageReason = z.infer<typeof BlockageReasonSchema>
