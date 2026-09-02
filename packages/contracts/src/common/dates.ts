import { z } from 'zod'
import { publicErrorMap, publicValidationMessage } from './zod'

const LOCAL_DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function daysInMonth(year: number, month: number) {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28
  }

  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30
  }

  if (month >= 1 && month <= 12) {
    return 31
  }

  return 0
}

export function isValidLocalDateKey(value: string) {
  const match = LOCAL_DATE_KEY.exec(value)

  if (!match) {
    return false
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  return day >= 1 && day <= daysInMonth(year, month)
}

export const LocalDateKeySchema = z
  .string({ errorMap: publicErrorMap })
  .refine(isValidLocalDateKey, { message: publicValidationMessage })

export const IsoTimestampSchema = z
  .string({ errorMap: publicErrorMap })
  .datetime({ offset: true, message: publicValidationMessage })
