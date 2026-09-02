'use client'

import { useEffect, useState } from 'react'
import { Button } from '../../../components/ui/Button'

const MESSAGES = [
  'Entendendo o que está bloqueando você…',
  'Reduzindo a tarefa para algo possível…',
  'Montando um primeiro passo…',
]

interface UnlockTaskLoadingProps {
  onCancel: () => void
}

export function UnlockTaskLoading({ onCancel }: UnlockTaskLoadingProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      return
    }

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % MESSAGES.length)
    }, 2800)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div
      className="space-y-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="text-sm text-ink dark:text-ink-dark">{MESSAGES[index]}</p>
      <p className="text-sm text-muted dark:text-muted-dark">
        Isso pode levar alguns segundos. Fechar agora só interrompe a espera
        nesta tela.
      </p>
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancelar espera
      </Button>
    </div>
  )
}
