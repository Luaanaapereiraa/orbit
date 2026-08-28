import type { ReactNode } from 'react'
import { ProductShell } from '../../components/ProductShell'

export default function ProductLayout({ children }: { children: ReactNode }) {
  return <ProductShell>{children}</ProductShell>
}
