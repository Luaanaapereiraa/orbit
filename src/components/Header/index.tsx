import { ChartBar, Gear, Moon, Scroll, Sun, Timer } from 'phosphor-react'
import { NavLink } from 'react-router-dom'
import logoPomodoroDev from '../../assets/logo.svg'
import { usePomodoro } from '../../contexts/PomodoroContext'
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
        <img src={logoPomodoroDev} alt="Pomodoro Dev" className="h-10 w-10" />
        <div className="hidden sm:block">
          <strong className="block text-sm font-bold text-zinc-900 dark:text-zinc-100">
            Pomodoro Dev
          </strong>
          <span className="text-xs text-zinc-500">Foque em ciclos</span>
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
                'flex h-11 w-11 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
                isActive && 'bg-emerald-500/15 text-emerald-500',
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
        className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      >
        {isDark ? <Sun size={20} /> : <Moon size={20} />}
      </button>
    </header>
  )
}

export function BottomNav() {
  return (
    <nav className="fixed right-4 bottom-4 left-4 z-20 flex items-center justify-around rounded-2xl border border-zinc-200 bg-white/90 p-2 shadow-lg backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-900/90">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          title={link.title}
          className={({ isActive }) =>
            cn(
              'flex h-11 w-11 items-center justify-center rounded-xl text-zinc-500',
              isActive && 'bg-emerald-500/15 text-emerald-500',
            )
          }
        >
          <link.icon size={22} />
        </NavLink>
      ))}
    </nav>
  )
}
