import { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface ToggleProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  checked: boolean
  label: string
}

export function Toggle({ checked, label, className, ...props }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cn(
        'flex w-full items-center justify-between gap-4 rounded-xl px-1 py-2 text-left',
        className,
      )}
      {...props}
    >
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
        {label}
      </span>
      <span
        className={cn(
          'relative h-6 w-11 rounded-full transition',
          checked ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </button>
  )
}
