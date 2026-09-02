import { z } from 'zod'

export const publicValidationMessage = 'Invalid value'
export const unknownFieldMessage = 'Unknown field'

export const publicErrorMap: z.ZodErrorMap = (issue) => {
  if (issue.code === z.ZodIssueCode.unrecognized_keys) {
    return { message: unknownFieldMessage }
  }

  return { message: publicValidationMessage }
}

export function publicObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape, { errorMap: publicErrorMap }).strict()
}
