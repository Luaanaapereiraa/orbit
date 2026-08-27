import { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

const variants = {
  primary: 'bg-brand text-white hover:bg-brand-strong disabled:hover:bg-brand',
  danger: 'bg-danger text-white hover:bg-red-500 disabled:hover:bg-danger',
  secondary:
    'bg-line text-ink hover:bg-canvas dark:bg-line-dark dark:text-ink-dark dark:hover:bg-canvas-dark',
  ghost:
    'bg-transparent text-muted hover:bg-line hover:text-ink dark:text-muted-dark dark:hover:bg-line-dark dark:hover:text-ink-dark',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
}

export function Button({
  className,
  variant = 'primary',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
