export const DISPLAY_NAME_MIN_LENGTH = 2
export const DISPLAY_NAME_MAX_LENGTH = 80
export const CRAFT_MIN_LENGTH = 2
export const CRAFT_MAX_LENGTH = 80

export type Craft = string

export type SignUpProfile = {
  displayName: string
  craft: Craft
}

export function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function normalizeCraft(value: string) {
  return normalizeDisplayName(value)
}

export function isValidDisplayName(value: string) {
  const name = normalizeDisplayName(value)
  return (
    name.length >= DISPLAY_NAME_MIN_LENGTH &&
    name.length <= DISPLAY_NAME_MAX_LENGTH
  )
}

export function isValidCraft(value: string) {
  const craft = normalizeCraft(value)
  return craft.length >= CRAFT_MIN_LENGTH && craft.length <= CRAFT_MAX_LENGTH
}

export function profileFromMetadata(metadata: unknown): {
  displayName: string | null
  craft: Craft | null
} {
  if (!metadata || typeof metadata !== 'object') {
    return { displayName: null, craft: null }
  }

  const record = metadata as Record<string, unknown>
  const rawName = [record.display_name, record.full_name, record.name].find(
    (value) => typeof value === 'string' && normalizeDisplayName(value),
  )
  const rawCraft =
    typeof record.craft === 'string' ? normalizeCraft(record.craft) : ''

  return {
    displayName:
      typeof rawName === 'string' ? normalizeDisplayName(rawName) : null,
    craft: rawCraft.length > 0 ? rawCraft : null,
  }
}
