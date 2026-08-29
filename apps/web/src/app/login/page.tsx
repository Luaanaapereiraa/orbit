'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Card } from '../../components/ui/Card'
import { MagicLinkForm } from '../../features/auth/MagicLinkForm'

function LoginContent() {
  const params = useSearchParams()
  const error = params.get('error')

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Card className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-ink dark:text-ink-dark">
            Entrar
          </h1>
          <p className="mt-2 text-sm text-muted dark:text-muted-dark">
            Entre para receber um próximo passo criado para esta tarefa. Seu
            planner continua funcionando normalmente sem login.
          </p>
        </div>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            Não foi possível concluir o acesso. Peça um novo link.
          </p>
        ) : null}
        <MagicLinkForm />
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
