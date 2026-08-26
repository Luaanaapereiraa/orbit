import { ChartBar, Gear, Moon, Scroll, Sun, Timer } from 'phosphor-react'
import { NavLink } from 'react-router-dom'
import logoOrbit from '../../assets/logo.svg'
import { usePomodoro } from '../../contexts/PomodoroContext'
import { APP_NAME, APP_TAGLINE } from '../../lib/brand'
import { cn } from '../../lib/cn'

const links = [
  { to: '/', title: 'Timer', icon: Timer, end: true },
  { to: '/history', title: 'Histórico', icon: Scroll, end: false },
  { to: '/stats', title: 'Estatísticas', icon: ChartBar, end: false },
  { to: '/settings', title: 'Configurações', icon: Gear, end: false },
]

export function Header() {
  const { settings, updateSettings } = usePomodoro()
  const isDark = settings.theme === 'dark'

  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <img src={logoOrbit} alt={APP_NAME} className="h-10 w-10" />
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
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            title={link.title}
            className={({ isActive }) =>
              cn(
                'flex h-11 w-11 items-center justify-center rounded-xl text-muted transition hover:bg-line hover:text-ink dark:text-muted-dark dark:hover:bg-line-dark dark:hover:text-ink-dark',
                isActive && 'bg-brand/15 text-brand-strong',
              )
            }
          >
            <link.icon size={22} />
          </NavLink>
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
  return (
    <nav className="fixed right-4 bottom-4 left-4 z-20 flex items-center justify-around rounded-2xl border border-line bg-panel/90 p-2 shadow-lg backdrop-blur md:hidden dark:border-line-dark dark:bg-panel-dark/90">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          title={link.title}
          className={({ isActive }) =>
            cn(
              'flex h-11 w-11 items-center justify-center rounded-xl text-muted dark:text-muted-dark',
              isActive && 'bg-brand/15 text-brand-strong',
            )
          }
        >
          <link.icon size={22} />
        </NavLink>
      ))}
    </nav>
  )
}
