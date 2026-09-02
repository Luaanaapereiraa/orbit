'use client'

import { type FormEvent, useRef, useState } from 'react'
import { Plus } from '@phosphor-icons/react'
import { usePomodoro } from '../../contexts/PomodoroContext'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'

export function QuickCapture() {
  const { captureInboxTask } = usePomodoro()
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()

    if (!trimmed) {
      return
    }

    const captured = captureInboxTask(trimmed)

    if (!captured) {
      return
    }

    setTitle('')
    setStatus(`Capturado: ${trimmed}`)
    inputRef.current?.focus()
  }

  return (
    <Card>
      <h2 className="text-lg font-bold text-ink dark:text-ink-dark">
        Tirar da cabeça
      </h2>
      <p className="mt-1 text-sm text-muted dark:text-muted-dark">
        Capture agora. Você organiza depois.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <label className="sr-only" htmlFor="quick-capture-title">
          O que você precisa lembrar?
        </label>
        <input
          id="quick-capture-title"
          ref={inputRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="O que você precisa lembrar?"
          className="h-11 flex-1 rounded-xl border border-line bg-transparent px-3 text-sm text-ink outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand dark:border-line-dark dark:text-ink-dark"
        />
        <Button
          type="submit"
          className="h-11 min-w-11 px-4"
          disabled={!title.trim()}
          aria-label="Capturar tarefa"
        >
          <Plus size={18} aria-hidden />
          <span className="hidden sm:inline">Capturar</span>
        </Button>
      </form>

      <p className="sr-only" aria-live="polite">
        {status}
      </p>
    </Card>
  )
}
