import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { PomodoroProvider } from '../contexts/PomodoroContext'
import { Home } from '../pages/Home'
import { History } from '../pages/History'

function renderHome() {
  return render(
    <MemoryRouter>
      <PomodoroProvider>
        <Home />
      </PomodoroProvider>
    </MemoryRouter>,
  )
}

describe('Home', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('keeps start disabled until a task exists', async () => {
    const user = userEvent.setup()
    renderHome()

    expect(screen.getByRole('button', { name: /começar/i })).toBeDisabled()

    await user.type(
      screen.getByPlaceholderText('Nova tarefa'),
      'Estudar testes',
    )
    await user.click(screen.getByRole('button', { name: /adicionar tarefa/i }))

    expect(screen.getByText('Estudar testes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /começar/i })).toBeEnabled()
  })
})

describe('History', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('shows an empty state when there are no cycles', () => {
    render(
      <PomodoroProvider>
        <History />
      </PomodoroProvider>,
    )

    expect(
      screen.getByText('Nenhum ciclo registrado ainda.'),
    ).toBeInTheDocument()
  })
})
