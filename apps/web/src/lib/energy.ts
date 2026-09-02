import type { TaskEnergy } from '@destravai/core'

export const ENERGY_OPTIONS: { value: TaskEnergy; label: string }[] = [
  { value: 'low', label: 'Leve' },
  { value: 'medium', label: 'Moderada' },
  { value: 'high', label: 'Exige energia' },
]

export function energyLabel(energy: TaskEnergy | null) {
  if (!energy) {
    return null
  }

  return ENERGY_OPTIONS.find((option) => option.value === energy)?.label ?? null
}
