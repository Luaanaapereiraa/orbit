import { z } from 'zod'
import { publicValidationMessage } from './zod'

export const UuidSchema = z
  .string({ errorMap: () => ({ message: publicValidationMessage }) })
  .uuid({ message: publicValidationMessage })
