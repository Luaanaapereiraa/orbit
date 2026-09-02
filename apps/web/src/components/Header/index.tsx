'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarBlank,
  ChartBar,
  Gear,
  Moon,
  Scroll,
  Sun,
  Timer,
} from '@phosphor-icons/react'
import { useAuth } from '../../contexts/AuthContext'
import { usePomodoro } from '../../contexts/PomodoroContext'
import { APP_NAME, APP_TAGLINE } from '../../lib/brand'
import { cn } from '../../lib/cn'

const links = [
  { to: '/', title: 'Hoje', icon: CalendarBlank, end: true },
  { to: '/focus', title: 'Foco', icon: Timer, end: false },
  { to: '/history', title: 'Histórico', icon: Scroll, end: false },
  { to: '/stats', title: 'Estatísticas', icon: ChartBar, end: false },
  { to: '/settings', title: 'Configurações', icon: Gear, end: false },
]

function isActivePath(pathname: string | null, href: string, end: boolean) {
  const current = pathname ?? ''
  if (end) {
    return current === href
  }

  return current === href || current.startsWith(`${href}/`)
}

export function Header() {
  const pathname = usePathname()
  const { session, isLoading } = useAuth()
  const { settings, updateSettings } = usePomodoro()
  const isDark = settings.theme === 'dark'
  const showSignIn = !isLoading && !session

  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <img src="/logo.svg" alt={APP_NAME} className="h-10 w-10" />
        <div className="hidden sm:block">
          <strong className="block text-sm font-bold text-ink dark:text-ink-dark">
            {APP_NAME}
          </strong>
          <span className="text-xs text-muted dark:text-muted-dark">
            {APP_TAGLINE}
          </span>
        </div>
      </div>

      <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
        {links.map((link) => (
          <Link
            key={link.to}
            href={link.to}
            title={link.title}
            aria-label={link.title}
            aria-current={
              isActivePath(pathname, link.to, link.end) ? 'page' : undefined
            }
            className={cn(
              'flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-muted transition hover:bg-line hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none dark:text-muted-dark dark:hover:bg-line-dark dark:hover:text-ink-dark',
              isActivePath(pathname, link.to, link.end) &&
                'bg-brand/15 text-brand-strong',
            )}
          >
            <link.icon size={22} aria-hidden />
            <span className="hidden lg:inline">{link.title}</span>
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-1 sm:gap-2">
        {showSignIn ? (
          <Link
            href="/login"
            className="flex h-11 items-center rounded-xl px-3 text-sm font-bold text-brand-strong transition hover:bg-line focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none dark:hover:bg-line-dark"
          >
            Entrar
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => updateSettings({ theme: isDark ? 'light' : 'dark' })}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-muted transition hover:bg-line hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none dark:text-muted-dark dark:hover:bg-line-dark dark:hover:text-ink-dark"
          aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>
    </header>
  )
}

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Principal"
      className="fixed right-4 bottom-4 left-4 z-20 flex items-center justify-around gap-1 rounded-2xl border border-line bg-panel/90 p-2 shadow-lg backdrop-blur md:hidden dark:border-line-dark dark:bg-panel-dark/90"
    >
      {links.map((link) => (
        <Link
          key={link.to}
          href={link.to}
          title={link.title}
          aria-label={link.title}
          aria-current={
            isActivePath(pathname, link.to, link.end) ? 'page' : undefined
          }
          className={cn(
            'flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] leading-tight text-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none dark:text-muted-dark',
            isActivePath(pathname, link.to, link.end) &&
              'bg-brand/15 text-brand-strong',
          )}
        >
          <link.icon size={22} aria-hidden />
          <span className="max-w-full text-center">{link.title}</span>
        </Link>
      ))}
    </nav>
  )
}
