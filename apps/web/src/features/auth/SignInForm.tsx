'use client'

import { type FormEvent, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../contexts/AuthContext'

interface SignInFormProps {
  title?: string
  description?: string
}

export function SignInForm({
  title = 'Entre para pedir ajuda',
  description = 'A sugestão vem da API autenticada. A web só envia o seu JWT e o contexto da tarefa.',
}: SignInFormProps) {
  const { configured, signIn, signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password)
      } else {
        await signUp(email.trim(), password)
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Não foi possível autenticar agora.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (!configured) {
    return (
      <p className="text-sm text-muted dark:text-muted-dark" role="status">
        A autenticação ainda não está configurada neste ambiente. Use as
        variáveis públicas do Supabase, nunca um segredo.
      </p>
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
      <label className="block space-y-1">
        <span className="text-sm font-medium">Senha</span>
        <input
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 w-full rounded-xl border border-line bg-transparent px-3 text-sm outline-none focus:border-brand dark:border-line-dark"
        />
      </label>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        >
          {mode === 'signin' ? 'Criar conta' : 'Já tenho conta'}
        </Button>
        <Button
          type="submit"
          disabled={busy || !email.trim() || password.length < 6}
        >
          {mode === 'signin' ? 'Entrar' : 'Criar conta e entrar'}
        </Button>
      </div>
    </form>
  )
}
