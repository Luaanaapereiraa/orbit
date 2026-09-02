import { z } from 'zod'
import { publicErrorMap } from './zod'

export const EnergyLevelSchema = z.enum(['low', 'medium', 'high'], {
  errorMap: publicErrorMap,
})

export const NullableEnergyLevelSchema = EnergyLevelSchema.nullable()

export type EnergyLevel = z.infer<typeof EnergyLevelSchema>
