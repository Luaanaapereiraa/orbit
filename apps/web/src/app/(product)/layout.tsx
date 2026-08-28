import { ProductShell } from '../../components/ProductShell'

export default function ProductLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ProductShell>{children}</ProductShell>
}
