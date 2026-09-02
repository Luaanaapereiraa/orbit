import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthClient, Session } from '../lib/auth/types'
import { persistPomodoroState, STORAGE_KEY_DESTRAVAI } from '../lib/storage'
import { makeState, makeTask } from '../test/factories'
import { AuthCredentialsForm } from '../features/auth/AuthCredentialsForm'
import { AuthProvider, useAuth } from './AuthContext'
import { PomodoroProvider } from './PomodoroContext'

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push }),
}))

function session(): Session {
  return {
    accessToken: 'user-jwt',
    user: {
      id: 'user-1',
      email: 'a@b.c',
      displayName: 'Ana',
      craft: 'engineering',
    },
  }
}

function createClient(overrides: Partial<AuthClient> = {}): AuthClient {
  return {
    async getSession() {
      return null
    },
    async signInWithPassword() {
      return undefined
    },
    async signUpWithPassword() {
      return { needsEmailConfirmation: false }
    },
    async signInWithGoogle() {
      return undefined
    },
    async resetPasswordForEmail() {
      return undefined
    },
    async updatePassword() {
      return undefined
    },
    async signOut() {
      return undefined
    },
    async getAccessToken() {
      return null
    },
    onAuthStateChange() {
      return () => undefined
    },
    ...overrides,
  }
}

function TokenProbe() {
  const { getAccessToken, session: current } = useAuth()
  return (
    <button
      type="button"
      onClick={() => {
        getAccessToken()
      }}
    >
      {current ? 'com sessao' : 'sem sessao'}
    </button>
  )
}

describe('AuthProvider', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
    navigation.push.mockReset()
  })

  it('starts without a session and can sign in with password', async () => {
    const signInWithPassword = vi.fn(async () => undefined)
    const user = userEvent.setup()

    render(
      <AuthProvider skipBootstrap client={createClient({ signInWithPassword })}>
        <AuthCredentialsForm />
      </AuthProvider>,
    )

    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('E-mail'), 'a@b.c')
    await user.type(screen.getByLabelText('Senha'), 'senha-segura')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(signInWithPassword).toHaveBeenCalledWith('a@b.c', 'senha-segura')
    expect(navigation.push).toHaveBeenCalledWith('/')
  })

  it('asks to confirm e-mail when signup does not create a session', async () => {
    const signUpWithPassword = vi.fn(async () => ({
      needsEmailConfirmation: true,
    }))
    const user = userEvent.setup()

    render(
      <AuthProvider skipBootstrap client={createClient({ signUpWithPassword })}>
        <AuthCredentialsForm />
      </AuthProvider>,
    )

    await user.click(screen.getByRole('tab', { name: 'Criar conta' }))
    await user.type(screen.getByLabelText('Nome'), 'Nova Pessoa')
    await user.type(screen.getByLabelText('E-mail'), 'nova@b.c')
    await user.type(screen.getByLabelText('Área'), 'Engenharia')
    await user.type(screen.getByLabelText('Senha'), 'senha-segura')
    await user.type(screen.getByLabelText('Confirmar senha'), 'senha-segura')
    await user.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(signUpWithPassword).toHaveBeenCalledWith(
      'nova@b.c',
      'senha-segura',
      {
        displayName: 'Nova Pessoa',
        craft: 'Engenharia',
      },
    )
    expect(await screen.findByText('Confira seu e-mail')).toBeInTheDocument()
    expect(navigation.push).not.toHaveBeenCalled()
  })

  it('asks to confirm the password before creating an account', async () => {
    const signUpWithPassword = vi.fn(async () => ({
      needsEmailConfirmation: true,
    }))
    const user = userEvent.setup()

    render(
      <AuthProvider skipBootstrap client={createClient({ signUpWithPassword })}>
        <AuthCredentialsForm />
      </AuthProvider>,
    )

    await user.click(screen.getByRole('tab', { name: 'Criar conta' }))
    await user.type(screen.getByLabelText('Nome'), 'Nova Pessoa')
    await user.type(screen.getByLabelText('E-mail'), 'nova@b.c')
    await user.type(screen.getByLabelText('Área'), 'Produto')
    await user.type(screen.getByLabelText('Senha'), 'senha-segura')
    await user.type(screen.getByLabelText('Confirmar senha'), 'outra-senha')
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeDisabled()
    expect(signUpWithPassword).not.toHaveBeenCalled()
  })

  it('starts Google OAuth from the login form', async () => {
    const signInWithGoogle = vi.fn(async () => undefined)
    const user = userEvent.setup()

    render(
      <AuthProvider skipBootstrap client={createClient({ signInWithGoogle })}>
        <AuthCredentialsForm />
      </AuthProvider>,
    )

    await user.click(
      screen.getByRole('button', { name: 'Continuar com Google' }),
    )
    expect(signInWithGoogle).toHaveBeenCalledTimes(1)
  })

  it('sends a password recovery email without revealing if the address exists', async () => {
    const resetPasswordForEmail = vi.fn(async () => undefined)
    const user = userEvent.setup()

    render(
      <AuthProvider
        skipBootstrap
        client={createClient({ resetPasswordForEmail })}
      >
        <AuthCredentialsForm />
      </AuthProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Esqueci a senha' }))
    await user.type(screen.getByLabelText('E-mail'), 'a@b.c')
    await user.click(
      screen.getByRole('button', { name: 'Enviar link de recuperação' }),
    )
    expect(resetPasswordForEmail).toHaveBeenCalledWith('a@b.c')
    expect(await screen.findByText('E-mail enviado')).toBeInTheDocument()
  })

  it('updates the password after a recovery session', async () => {
    const updatePassword = vi.fn(async () => undefined)
    const user = userEvent.setup()

    render(
      <AuthProvider
        skipBootstrap
        client={createClient({ updatePassword })}
        initialSession={session()}
      >
        <AuthCredentialsForm resetMode />
      </AuthProvider>,
    )

    await user.type(screen.getByLabelText('Senha'), 'nova-senha')
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }))
    expect(updatePassword).toHaveBeenCalledWith('nova-senha')
    expect(navigation.push).toHaveBeenCalledWith('/')
  })

  it('exposes an existing session and clears it on logout without dropping tasks', async () => {
    persistPomodoroState(
      makeState({
        tasks: [makeTask({ id: 'task-1', title: 'Escrever o parágrafo' })],
      }),
    )
    const signOut = vi.fn(async () => undefined)
    const user = userEvent.setup()

    function SignOutButton() {
      const { signOut: leave, user: current } = useAuth()
      return (
        <button type="button" onClick={() => leave()}>
          {current ? `Sair ${current.email}` : 'Saiu'}
        </button>
      )
    }

    render(
      <AuthProvider
        skipBootstrap
        client={createClient({
          getSession: async () => session(),
          getAccessToken: async () => 'user-jwt',
          signOut,
        })}
        initialSession={session()}
      >
        <PomodoroProvider>
          <SignOutButton />
          <TokenProbe />
        </PomodoroProvider>
      </AuthProvider>,
    )

    expect(
      screen.getByRole('button', { name: 'Sair a@b.c' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'com sessao' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sair a@b.c' }))
    expect(signOut).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Saiu' })).toBeInTheDocument()
    })
    const stored = JSON.parse(
      String(localStorage.getItem(STORAGE_KEY_DESTRAVAI)),
    )
    expect(stored.state.tasks[0].title).toBe('Escrever o parágrafo')
  })

  it('ignores a stale TOKEN_REFRESHED after logout and keeps a later login', async () => {
    let emit: (next: Session | null, event?: string) => void = () => undefined
    const signOut = vi.fn(async () => undefined)
    const user = userEvent.setup()

    function SignOutButton() {
      const { signOut: leave, user: current } = useAuth()
      return (
        <button type="button" onClick={() => leave()}>
          {current ? `Sair ${current.email}` : 'Saiu'}
        </button>
      )
    }

    render(
      <AuthProvider
        skipBootstrap
        client={createClient({
          signOut,
          onAuthStateChange(listener) {
            emit = listener
            return () => undefined
          },
        })}
        initialSession={session()}
      >
        <SignOutButton />
      </AuthProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Sair a@b.c' }))
    expect(screen.getByRole('button', { name: 'Saiu' })).toBeInTheDocument()

    emit(
      {
        accessToken: 'refreshed-after-logout',
        user: {
          id: 'user-1',
          email: 'a@b.c',
          displayName: 'Ana',
          craft: 'engineering',
        },
      },
      'TOKEN_REFRESHED',
    )
    expect(screen.getByRole('button', { name: 'Saiu' })).toBeInTheDocument()

    emit(
      {
        accessToken: 'new-login-jwt',
        user: {
          id: 'user-2',
          email: 'novo@b.c',
          displayName: 'Novo',
          craft: 'design',
        },
      },
      'SIGNED_IN',
    )
    expect(
      await screen.findByRole('button', { name: 'Sair novo@b.c' }),
    ).toBeInTheDocument()
  })

  it('cleans the auth subscription on unmount', async () => {
    const unsubscribe = vi.fn()
    const { unmount } = render(
      <AuthProvider
        client={createClient({
          onAuthStateChange() {
            return unsubscribe
          },
        })}
      >
        <p>auth</p>
      </AuthProvider>,
    )

    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })
})
