export interface TimedCycle {
  startDate: Date | string
  pausedMs: number
  pausedAt?: Date | string
}

export function getElapsedSeconds(cycle: TimedCycle, now = Date.now()) {
  const start = new Date(cycle.startDate).getTime()
  const extraPause = cycle.pausedAt
    ? now - new Date(cycle.pausedAt).getTime()
    : 0
  const paused = (cycle.pausedMs ?? 0) + extraPause

  return Math.max(0, Math.floor((now - start - paused) / 1000))
}

export function formatClock(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds)
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0',
  )}`
}
