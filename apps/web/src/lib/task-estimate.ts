export const ESTIMATE_PRESETS = [5, 15, 25, 45, 60] as const

export function isValidTaskEstimate(value: number | null) {
  if (value === null) {
    return true
  }

  return Number.isInteger(value) && value > 0
}
