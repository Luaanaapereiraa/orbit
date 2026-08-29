'use client'

import { type FormEvent, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../contexts/AuthContext'

interface MagicLinkFormProps {
  title?: string
  description?: string
}

export function MagicLinkForm({
  title = 'Entre para usar o agente',
  description = 'Enviamos um link de acesso para o seu e-mail. O planner continua funcionando sem login.',
}: MagicLinkFormProps) {
  const { configured, signInWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signInWithEmail(email.trim())
      setSent(true)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Não foi possível enviar o link de acesso.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (!configured) {
    return (
      <p className="text-sm text-muted dark:text-muted-dark" role="status">
        A autenticação ainda não está configurada neste ambiente. Use só as
        variáveis públicas do Supabase.
      </p>
    )
  }

  if (sent) {
    return (
      <div className="space-y-2" role="status">
        <h3 className="text-base font-bold text-ink dark:text-ink-dark">
          Link enviado
        </h3>
        <p className="text-sm text-muted dark:text-muted-dark">
          Abra o e-mail e toque no link de acesso. Depois você volta para a
          Tela Hoje.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-ink dark:text-ink-dark">
          {title}
        </h3>
        <p className="mt-1 text-sm text-muted dark:text-muted-dark">
          {description}
        </p>
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium">E-mail</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-11 w-full rounded-xl border border-line bg-transparent px-3 text-sm outline-none focus:border-brand dark:border-line-dark"
        />
      </label>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy || !email.trim()}>
        {busy ? 'Enviando…' : 'Enviar link de acesso'}
      </Button>
    </form>
  )
}
