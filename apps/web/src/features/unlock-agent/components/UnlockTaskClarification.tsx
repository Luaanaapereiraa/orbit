'use client'

import { type FormEvent, useState } from 'react'
import { BLOCKAGE_DETAILS_MAX_LENGTH } from '@destravai/contracts'
import { Button } from '../../../components/ui/Button'

interface UnlockTaskClarificationProps {
  question: string
  onContinue: (answer: string) => void
}

export function UnlockTaskClarification({
  question,
  onContinue,
}: UnlockTaskClarificationProps) {
  const [answer, setAnswer] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!answer.trim()) {
      return
    }
    onContinue(answer.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted dark:text-muted-dark">
        Preciso de um detalhe para montar o próximo passo. Isso abre um novo
        pedido; não é uma conversa contínua.
      </p>
      <p className="text-sm text-ink dark:text-ink-dark">{question}</p>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Sua resposta</span>
        <textarea
          data-initial-focus=""
          value={answer}
          required
          maxLength={BLOCKAGE_DETAILS_MAX_LENGTH}
          onChange={(event) => setAnswer(event.target.value)}
          rows={3}
          className="w-full rounded-xl border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-brand dark:border-line-dark"
        />
      </label>
      <Button type="submit" disabled={!answer.trim()}>
        Continuar
      </Button>
    </form>
  )
}
