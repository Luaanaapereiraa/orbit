import { type CycleType } from '@destravai/core'
import { cn } from '../../lib/cn'

const typeStyles: Record<CycleType, string> = {
  focus: 'text-focus',
  shortBreak: 'text-rest',
  longBreak: 'text-rest-long',
}

const typeStroke: Record<CycleType, string> = {
  focus: 'stroke-focus',
  shortBreak: 'stroke-rest',
  longBreak: 'stroke-rest-long',
}

interface ProgressRingProps {
  progress: number
  timeLabel: string
  caption: string
  type: CycleType
  paused?: boolean
}

export function ProgressRing({
  progress,
  timeLabel,
  caption,
  type,
  paused,
}: ProgressRingProps) {
  const size = 280
  const stroke = 10
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset =
    circumference - Math.min(Math.max(progress, 0), 1) * circumference

  return (
    <div className="relative grid place-items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="max-w-full -rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-line dark:stroke-line-dark"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={cn(
            typeStroke[type],
            'transition-[stroke-dashoffset] duration-300',
          )}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <strong
          className={cn(
            'font-mono text-5xl font-bold tracking-tight sm:text-6xl',
            typeStyles[type],
          )}
        >
          {timeLabel}
        </strong>
        <span className="mt-2 text-sm text-muted dark:text-muted-dark">
          {paused ? 'Pausado' : caption}
        </span>
      </div>
    </div>
  )
}
