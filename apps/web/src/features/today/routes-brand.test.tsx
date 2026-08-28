import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Header, BottomNav } from '../../components/Header'
import { PomodoroProvider } from '../../contexts/PomodoroContext'
import { Home } from '../home/Home'
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from '../../lib/brand'
import manifest from '../../app/manifest'

const navigation = vi.hoisted(() => ({
  pathname: '/',
  push: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}))

vi.mock('next/link', () => ({
  default({
    href,
    children,
    ...props
  }: {
    href: string
    children: ReactNode
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },
}))

function renderNav() {
  return render(
    <PomodoroProvider>
      <Header />
      <BottomNav />
    </PomodoroProvider>,
  )
}

describe('brand and routes', () => {
  beforeEach(() => {
    navigation.pathname = '/'
    navigation.push.mockReset()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('shows DestravAI in the header and keeps Orbit out of the visible UI', async () => {
    renderNav()

    expect(
      await screen.findAllByText(APP_NAME, { exact: true }),
    ).not.toHaveLength(0)
    expect(screen.getByText(APP_TAGLINE)).toBeInTheDocument()
    expect(screen.getByAltText(APP_NAME)).toBeInTheDocument()
    expect(screen.queryByText('Orbit')).toBeNull()
    expect(screen.queryByAltText('Orbit')).toBeNull()
  })

  it('marks Hoje as the active root route and Foco as /focus', async () => {
    const { rerender } = renderNav()

    const hojeLinks = await screen.findAllByRole('link', { name: 'Hoje' })
    expect(hojeLinks[0]).toHaveAttribute('href', '/')
    expect(hojeLinks[0]).toHaveAttribute('aria-current', 'page')

    const focusLinks = screen.getAllByRole('link', { name: 'Foco' })
    expect(focusLinks[0]).toHaveAttribute('href', '/focus')
    expect(focusLinks[0]).not.toHaveAttribute('aria-current')

    navigation.pathname = '/focus'
    rerender(
      <PomodoroProvider>
        <Header />
        <BottomNav />
      </PomodoroProvider>,
    )

    expect(screen.getAllByRole('link', { name: 'Foco' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getAllByRole('link', { name: 'Hoje' })[0]).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('keeps history, stats and settings URLs and exposes accessible names', async () => {
    renderNav()

    expect(
      (await screen.findAllByRole('link', { name: 'Histórico' }))[0],
    ).toHaveAttribute('href', '/history')
    expect(screen.getAllByRole('link', { name: 'Estatísticas' })[0]).toHaveAttribute(
      'href',
      '/stats',
    )
    expect(
      screen.getAllByRole('link', { name: 'Configurações' })[0],
    ).toHaveAttribute('href', '/settings')
  })

  it('publishes DestravAI in the web manifest', () => {
    const data = manifest()
    expect(data.name).toBe('DestravAI')
    expect(data.short_name).toBe('DestravAI')
    expect(data.description).toBe(APP_DESCRIPTION)
    expect(data.start_url).toBe('/')
    expect(JSON.stringify(data)).not.toContain('Orbit')
  })

  it('keeps the timer on /focus without depending on the Today route', async () => {
    render(
      <PomodoroProvider>
        <Home />
      </PomodoroProvider>,
    )

    expect(
      await screen.findByRole('button', { name: /começar/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Hoje' })).toBeNull()
  })
})
