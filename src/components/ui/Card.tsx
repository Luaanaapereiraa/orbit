import { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line bg-panel p-6 shadow-sm dark:border-line-dark dark:bg-panel-dark',
        className,
      )}
      {...props}
    />
  )
}
