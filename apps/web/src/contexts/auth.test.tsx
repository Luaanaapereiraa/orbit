import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthClient, Session } from '../lib/auth/types'
import { persistPomodoroState, STORAGE_KEY_DESTRAVAI } from '../lib/storage'
import { makeState, makeTask } from '../test/factories'
import { MagicLinkForm } from '../features/auth/MagicLinkForm'
import { AuthProvider, useAuth } from './AuthContext'
import { PomodoroProvider } from './PomodoroContext'

function session(): Session {
  return {
    accessToken: 'user-jwt',
    user: { id: 'user-1', email: 'a@b.c' },
  }
}

function createClient(overrides: Partial<AuthClient> = {}): AuthClient {
  return {
    async getSession() {
      return null
    },
    async signInWithEmail() {
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
  })

  it('starts without a session and can send a magic link', async () => {
    const signInWithEmail = vi.fn(async () => undefined)
    const user = userEvent.setup()

    render(
      <AuthProvider skipBootstrap client={createClient({ signInWithEmail })}>
        <MagicLinkForm />
      </AuthProvider>,
    )

    expect(
      screen.getByRole('button', { name: 'Enviar link de acesso' }),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText('E-mail'), 'a@b.c')
    await user.click(
      screen.getByRole('button', { name: 'Enviar link de acesso' }),
    )
    expect(signInWithEmail).toHaveBeenCalledWith('a@b.c')
    expect(await screen.findByText('Link enviado')).toBeInTheDocument()
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
