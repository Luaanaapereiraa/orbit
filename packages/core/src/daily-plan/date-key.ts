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

export function isValidLocalDateParts(year: number, month: number, day: number) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false
  }

  if (year < 0 || month < 1 || month > 12 || day < 1) {
    return false
  }

  return day <= daysInMonth(year, month)
}

export function isValidLocalDateKey(value: string) {
  if (typeof value !== 'string') {
    return false
  }

  const match = LOCAL_DATE_KEY.exec(value)

  if (!match) {
    return false
  }

  return isValidLocalDateParts(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  )
}

/**
 * Formats a local calendar date as `YYYY-MM-DD`.
 * `month` is 1–12 (not the 0-based index from `Date#getMonth()`).
 * Callers that have a `Date` must pass `getMonth() + 1`.
 * Does not use UTC conversion (`toISOString()`).
 */
export function formatLocalDateKey(
  year: number,
  month: number,
  day: number,
): string | null {
  if (!isValidLocalDateParts(year, month, day)) {
    return null
  }

  const yyyy = String(year).padStart(4, '0')
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')

  return `${yyyy}-${mm}-${dd}`
}
