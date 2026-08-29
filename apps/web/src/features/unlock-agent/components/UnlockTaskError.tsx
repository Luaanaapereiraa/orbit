'use client'

import { Button } from '../../../components/ui/Button'
import type { UnlockAgentError } from '../api/unlock-agent-errors'

interface UnlockTaskErrorProps {
  error: UnlockAgentError
  onRetry: () => void
  onSignIn?: () => void
  onClose: () => void
  retryDisabled?: boolean
  retryHint?: string | null
}

export function UnlockTaskErrorView({
  error,
  onRetry,
  onSignIn,
  onClose,
  retryDisabled = false,
  retryHint = null,
}: UnlockTaskErrorProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-danger" role="alert">
        {error.message}
      </p>
      {retryHint ? (
        <p className="text-sm text-muted dark:text-muted-dark" role="status">
          {retryHint}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {error.code === 'unauthenticated' && onSignIn ? (
          <Button type="button" onClick={onSignIn}>
            Entrar para usar o agente
          </Button>
        ) : null}
        {error.retryable ? (
          <Button type="button" onClick={onRetry} disabled={retryDisabled}>
            {error.sameRequest ? 'Consultar de novo' : 'Tentar de novo'}
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </div>
  )
}
