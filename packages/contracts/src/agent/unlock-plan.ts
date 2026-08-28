import { z } from 'zod'
import { EnergyLevelSchema } from '../common/energy'
import {
  MAX_RECOMMENDED_FOCUS_MINUTES,
  MAX_UNLOCK_PLAN_STEPS,
  MIN_RECOMMENDED_FOCUS_MINUTES,
  MIN_UNLOCK_PLAN_STEPS,
  NEXT_ACTION_MAX_LENGTH,
  STEP_TITLE_MAX_LENGTH,
  SUPPORTIVE_MESSAGE_MAX_LENGTH,
} from '../common/limits'
import { publicErrorMap, publicValidationMessage } from '../common/zod'
import { publicObject } from '../common/zod'

export const UnlockPlanStepSchema = publicObject({
  order: z.number({ errorMap: publicErrorMap }).int().positive(),
  title: z
    .string({ errorMap: publicErrorMap })
    .trim()
    .min(1)
    .max(STEP_TITLE_MAX_LENGTH),
  minutes: z.number({ errorMap: publicErrorMap }).int().positive(),
})

export const UnlockPlanSchema = publicObject({
  nextAction: z
    .string({ errorMap: publicErrorMap })
    .trim()
    .min(1)
    .max(NEXT_ACTION_MAX_LENGTH),
  steps: z
    .array(UnlockPlanStepSchema)
    .min(MIN_UNLOCK_PLAN_STEPS)
    .max(MAX_UNLOCK_PLAN_STEPS),
  totalMinutes: z.number({ errorMap: publicErrorMap }).int().positive(),
  recommendedFocusMinutes: z
    .number({ errorMap: publicErrorMap })
    .int()
    .min(MIN_RECOMMENDED_FOCUS_MINUTES)
    .max(MAX_RECOMMENDED_FOCUS_MINUTES),
  energy: EnergyLevelSchema,
  supportiveMessage: z
    .string({ errorMap: publicErrorMap })
    .trim()
    .min(1)
    .max(SUPPORTIVE_MESSAGE_MAX_LENGTH),
}).superRefine((plan, ctx) => {
  const hasSequentialOrder = plan.steps.every(
    (step, index) => step.order === index + 1,
  )

  if (!hasSequentialOrder) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: publicValidationMessage,
      path: ['steps'],
    })
  }
})

export type UnlockPlanStep = z.infer<typeof UnlockPlanStepSchema>
export type UnlockPlan = z.infer<typeof UnlockPlanSchema>
