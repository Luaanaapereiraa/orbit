'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChartBar, Gear, Moon, Scroll, Sun, Timer } from '@phosphor-icons/react'
import { usePomodoro } from '../../contexts/PomodoroContext'
import { APP_NAME, APP_TAGLINE } from '../../lib/brand'
import { cn } from '../../lib/cn'

const links = [
  { to: '/', title: 'Timer', icon: Timer, end: true },
  { to: '/history', title: 'Histórico', icon: Scroll, end: false },
  { to: '/stats', title: 'Estatísticas', icon: ChartBar, end: false },
  { to: '/settings', title: 'Configurações', icon: Gear, end: false },
]

function isActivePath(pathname: string, href: string, end: boolean) {
  if (end) {
    return pathname === href
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

export function Header() {
  const pathname = usePathname()
  const { settings, updateSettings } = usePomodoro()
  const isDark = settings.theme === 'dark'

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

      <nav className="hidden items-center gap-1 md:flex">
        {links.map((link) => (
          <Link
            key={link.to}
            href={link.to}
            title={link.title}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-xl text-muted transition hover:bg-line hover:text-ink dark:text-muted-dark dark:hover:bg-line-dark dark:hover:text-ink-dark',
              isActivePath(pathname, link.to, link.end) &&
                'bg-brand/15 text-brand-strong',
            )}
          >
            <link.icon size={22} />
          </Link>
        ))}
      </nav>

      <button
        type="button"
        onClick={() => updateSettings({ theme: isDark ? 'light' : 'dark' })}
        className="flex h-11 w-11 items-center justify-center rounded-xl text-muted transition hover:bg-line hover:text-ink dark:text-muted-dark dark:hover:bg-line-dark dark:hover:text-ink-dark"
        aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      >
        {isDark ? <Sun size={20} /> : <Moon size={20} />}
      </button>
    </header>
  )
}

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed right-4 bottom-4 left-4 z-20 flex items-center justify-around rounded-2xl border border-line bg-panel/90 p-2 shadow-lg backdrop-blur md:hidden dark:border-line-dark dark:bg-panel-dark/90">
      {links.map((link) => (
        <Link
          key={link.to}
          href={link.to}
          title={link.title}
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-xl text-muted dark:text-muted-dark',
            isActivePath(pathname, link.to, link.end) &&
              'bg-brand/15 text-brand-strong',
          )}
        >
          <link.icon size={22} />
        </Link>
      ))}
    </nav>
  )
}
