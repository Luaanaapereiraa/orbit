'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Card } from '../../components/ui/Card'
import { AuthCredentialsForm } from '../../features/auth/AuthCredentialsForm'

function LoginContent() {
  const params = useSearchParams()
  const error = params?.get('error')
  const resetMode = params?.get('reset') === '1'

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <Card className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-ink dark:text-ink-dark">
            {resetMode ? 'Redefinir senha' : 'Acesso'}
          </h1>
          <p className="mt-2 text-sm text-muted dark:text-muted-dark">
            {resetMode
              ? 'Defina uma nova senha para esta conta. O planner continua local.'
              : 'Entre ou crie uma conta para usar o Travei.'}
          </p>
        </div>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            Não foi possível concluir o acesso. Tente de novo.
          </p>
        ) : null}
        <AuthCredentialsForm resetMode={resetMode} />
        <Link
          href="/"
          className="inline-flex h-11 items-center text-sm font-bold text-brand-strong focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          Voltar para Hoje
        </Link>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-muted dark:text-muted-dark">
          Preparando o acesso…
        </p>
      }
    >
      <LoginContent />
    </Suspense>
  )
}
