'use client'

import { useEffect, useState } from 'react'
import { formatLocalDateKey } from '@destravai/core'

export function toLocalDateKey(date = new Date()) {
  return formatLocalDateKey(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  )
}

export function msUntilNextLocalMidnight(date = new Date()) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)

  return Math.max(next.getTime() - date.getTime(), 0)
}

export function formatPtBrDate(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)

  if (!match) {
    return dateKey
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function useLocalDateKey(enabled: boolean) {
  const [dateKey, setDateKey] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setDateKey(null)
      return
    }

    let timeoutId: number | undefined

    function refresh() {
      setDateKey(toLocalDateKey(new Date()))
    }

    function scheduleMidnight() {
      const wait = msUntilNextLocalMidnight(new Date())
      timeoutId = window.setTimeout(() => {
        refresh()
        scheduleMidnight()
      }, wait)
    }

    function onResume() {
      refresh()

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }

      scheduleMidnight()
    }

    refresh()
    scheduleMidnight()

    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('focus', onResume)

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }

      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('focus', onResume)
    }
  }, [enabled])

  return dateKey
}
