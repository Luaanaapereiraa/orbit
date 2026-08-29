'use client'

import { ReactNode } from 'react'
import { AuthProvider } from '../contexts/AuthContext'
import { BottomNav, Header } from './Header'

export function ProductShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 md:py-10">
        <div className="flex flex-1 flex-col rounded-3xl border border-line bg-panel/80 p-4 shadow-xl md:p-8 dark:border-line-dark dark:bg-canvas-dark/80">
          <Header />
          <main className="mt-8 flex-1 pb-20 md:pb-0">{children}</main>
        </div>
        <BottomNav />
      </div>
    </AuthProvider>
  )
}
