'use client'

import { ReactNode } from 'react'
import { SerwistProvider } from '@serwist/turbopack/react'

export function PwaRegister({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV !== 'production') {
    return children
  }

  return <SerwistProvider swUrl="/serwist/sw.js">{children}</SerwistProvider>
}
