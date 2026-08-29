'use client'

import { Button } from '../../../components/ui/Button'

interface UnlockTaskRejectedProps {
  message: string
  onClose: () => void
}

export function UnlockTaskRejected({
  message,
  onClose,
}: UnlockTaskRejectedProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink dark:text-ink-dark" role="status">
        {message}
      </p>
      <Button type="button" variant="secondary" onClick={onClose}>
        Fechar
      </Button>
    </div>
  )
}
