'use client'

import { GoogleLogo } from '@phosphor-icons/react'
import { type FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../contexts/AuthContext'
import {
  CRAFT_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  isValidCraft,
  isValidDisplayName,
  normalizeCraft,
  normalizeDisplayName,
} from '../../lib/auth/profile'

export const MIN_PASSWORD_LENGTH = 8

const fieldClassName =
  'h-11 w-full rounded-xl border border-line bg-transparent px-3 text-sm outline-none focus:border-brand dark:border-line-dark'

type Mode = 'signin' | 'signup' | 'forgot'

interface AuthCredentialsFormProps {
  resetMode?: boolean
}

export function AuthCredentialsForm({
  resetMode = false,
}: AuthCredentialsFormProps) {
  const router = useRouter()
  const {
    configured,
    session,
    signInWithPassword,
    signUpWithPassword,
    signInWithGoogle,
    resetPasswordForEmail,
    updatePassword,
  } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [craft, setCraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [passwordUpdated, setPasswordUpdated] = useState(false)

  async function run(action: () => Promise<void>) {
    setError('')
    setBusy(true)
    try {
      await action()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Não foi possível concluir o acesso.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleSignIn(event: FormEvent) {
    event.preventDefault()
    await run(async () => {
      await signInWithPassword(email.trim(), password)
      router.push('/')
    })
  }

  async function handleSignUp(event: FormEvent) {
    event.preventDefault()
    const name = normalizeDisplayName(displayName)
    const area = normalizeCraft(craft)
    if (!isValidDisplayName(name) || !isValidCraft(area)) {
      setError(
        'Preencha nome e área para o Travei personalizar o próximo passo.',
      )
      return
    }
    if (password !== passwordConfirm) {
      setError('As senhas não coincidem.')
      return
    }
    await run(async () => {
      const result = await signUpWithPassword(email.trim(), password, {
        displayName: name,
        craft: area,
      })
      if (result.needsEmailConfirmation) {
        setCheckEmail(true)
        return
      }
      router.push('/')
    })
  }

  async function handleForgot(event: FormEvent) {
    event.preventDefault()
    await run(async () => {
      await resetPasswordForEmail(email.trim())
      setResetSent(true)
    })
  }

  async function handleUpdatePassword(event: FormEvent) {
    event.preventDefault()
    await run(async () => {
      await updatePassword(password)
      setPasswordUpdated(true)
      router.push('/')
    })
  }

  async function handleGoogle() {
    await run(async () => {
      await signInWithGoogle()
    })
  }

  if (!configured) {
    return (
      <p className="text-sm text-muted dark:text-muted-dark" role="status">
        A autenticação ainda não está configurada neste ambiente. Use só as
        variáveis públicas do Supabase.
      </p>
    )
  }

  if (resetMode) {
    if (!session) {
      return (
        <p className="text-sm text-muted dark:text-muted-dark" role="status">
          Abra o link de recuperação de novo para definir uma senha.
        </p>
      )
    }

    if (passwordUpdated) {
      return (
        <p className="text-sm text-muted dark:text-muted-dark" role="status">
          Senha atualizada. Você já pode usar o planner autenticado.
        </p>
      )
    }

    return (
      <form onSubmit={handleUpdatePassword} className="space-y-4">
        <div>
          <h3 className="text-base font-bold text-ink dark:text-ink-dark">
            Nova senha
          </h3>
          <p className="mt-1 text-sm text-muted dark:text-muted-dark">
            Escolha uma senha com pelo menos {MIN_PASSWORD_LENGTH} caracteres.
          </p>
        </div>
        <PasswordField
          value={password}
          autoComplete="new-password"
          onChange={setPassword}
        />
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          className="w-full"
          disabled={busy || password.length < MIN_PASSWORD_LENGTH}
        >
          {busy ? 'Salvando…' : 'Salvar nova senha'}
        </Button>
      </form>
    )
  }

  if (checkEmail) {
    return (
      <div className="space-y-2" role="status">
        <h3 className="text-base font-bold text-ink dark:text-ink-dark">
          Confira seu e-mail
        </h3>
        <p className="text-sm text-muted dark:text-muted-dark">
          Se a conta precisar de confirmação, enviamos um link para concluir o
          cadastro. Depois você volta para a Tela Hoje.
        </p>
      </div>
    )
  }

  if (resetSent) {
    return (
      <div className="space-y-2" role="status">
        <h3 className="text-base font-bold text-ink dark:text-ink-dark">
          E-mail enviado
        </h3>
        <p className="text-sm text-muted dark:text-muted-dark">
          Se esse e-mail existir, enviamos um link para definir uma nova senha.
        </p>
      </div>
    )
  }

  const isSignup = mode === 'signup'
  const isForgot = mode === 'forgot'

  return (
    <div className="space-y-4">
      {isForgot ? null : (
        <div
          role="tablist"
          aria-label="Tipo de acesso"
          className="grid grid-cols-2 gap-1 rounded-xl bg-line p-1 dark:bg-line-dark"
        >
          <ModeTab
            selected={mode === 'signin'}
            onSelect={() => setMode('signin')}
          >
            Entrar
          </ModeTab>
          <ModeTab
            selected={mode === 'signup'}
            onSelect={() => setMode('signup')}
          >
            Criar conta
          </ModeTab>
        </div>
      )}

      <form
        onSubmit={submitHandlerFor(mode, {
          forgot: handleForgot,
          signup: handleSignUp,
          signin: handleSignIn,
        })}
        className="space-y-4"
      >
        {isForgot ? (
          <div>
            <h3 className="text-base font-bold text-ink dark:text-ink-dark">
              Esqueci a senha
            </h3>
            <p className="mt-1 text-sm text-muted dark:text-muted-dark">
              Enviamos um link para o e-mail da conta, se ele existir.
            </p>
          </div>
        ) : null}

        {isSignup ? (
          <label className="block space-y-1">
            <span className="text-sm font-medium">Nome</span>
            <input
              type="text"
              autoComplete="name"
              required
              minLength={2}
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className={fieldClassName}
            />
          </label>
        ) : null}

        <label className="block space-y-1">
          <span className="text-sm font-medium">E-mail</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={fieldClassName}
          />
        </label>

        {isSignup ? (
          <label className="block space-y-1">
            <span className="text-sm font-medium">Área</span>
            <input
              type="text"
              autoComplete="organization-title"
              required
              minLength={2}
              maxLength={CRAFT_MAX_LENGTH}
              value={craft}
              onChange={(event) => setCraft(event.target.value)}
              className={fieldClassName}
            />
          </label>
        ) : null}

        {isForgot ? null : (
          <PasswordField
            value={password}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            onChange={setPassword}
          />
        )}

        {isSignup ? (
          <PasswordField
            label="Confirmar senha"
            value={passwordConfirm}
            autoComplete="new-password"
            onChange={setPasswordConfirm}
          />
        ) : null}

        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          className="w-full"
          disabled={
            busy ||
            !email.trim() ||
            (!isForgot && password.length < MIN_PASSWORD_LENGTH) ||
            (isSignup &&
              (!isValidDisplayName(displayName) ||
                !isValidCraft(craft) ||
                password !== passwordConfirm))
          }
        >
          {submitLabelFor(mode, busy)}
        </Button>
      </form>

      {isForgot ? (
        <button
          type="button"
          className="text-sm font-bold text-brand-strong focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          onClick={() => {
            setMode('signin')
            setError('')
          }}
        >
          Voltar para entrar
        </button>
      ) : (
        <>
          {mode === 'signin' ? (
            <button
              type="button"
              className="text-sm font-medium text-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none dark:text-muted-dark"
              onClick={() => {
                setMode('forgot')
                setError('')
              }}
            >
              Esqueci a senha
            </button>
          ) : null}

          <div className="flex items-center gap-3 text-xs font-medium tracking-wide text-muted uppercase dark:text-muted-dark">
            <span className="h-px flex-1 bg-line dark:bg-line-dark" />
            ou
            <span className="h-px flex-1 bg-line dark:bg-line-dark" />
          </div>

          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={busy}
            onClick={() => {
              handleGoogle()
            }}
          >
            <GoogleLogo size={18} aria-hidden />
            Continuar com Google
          </Button>
        </>
      )}
    </div>
  )
}

function submitHandlerFor(
  mode: Mode,
  handlers: {
    forgot: (event: FormEvent) => Promise<void>
    signup: (event: FormEvent) => Promise<void>
    signin: (event: FormEvent) => Promise<void>
  },
) {
  if (mode === 'forgot') {
    return handlers.forgot
  }
  if (mode === 'signup') {
    return handlers.signup
  }
  return handlers.signin
}

function submitLabelFor(mode: Mode, busy: boolean) {
  if (mode === 'forgot') {
    return busy ? 'Enviando…' : 'Enviar link de recuperação'
  }
  if (mode === 'signup') {
    return busy ? 'Criando…' : 'Criar conta'
  }
  return busy ? 'Entrando…' : 'Entrar'
}

function ModeTab({
  selected,
  onSelect,
  children,
}: {
  selected: boolean
  onSelect: () => void
  children: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={
        selected
          ? 'h-10 rounded-lg bg-panel text-sm font-bold text-ink dark:bg-panel-dark dark:text-ink-dark'
          : 'h-10 rounded-lg text-sm font-medium text-muted dark:text-muted-dark'
      }
    >
      {children}
    </button>
  )
}

function PasswordField({
  label = 'Senha',
  value,
  autoComplete,
  onChange,
}: {
  label?: string
  value: string
  autoComplete: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="password"
        autoComplete={autoComplete}
        required
        minLength={MIN_PASSWORD_LENGTH}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClassName}
      />
    </label>
  )
}
