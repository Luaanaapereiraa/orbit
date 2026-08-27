import { Outlet } from 'react-router-dom'
import { BottomNav, Header } from '../../components/Header'

export function DefaultLayout() {
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 md:py-10">
      <div className="flex flex-1 flex-col rounded-3xl border border-line bg-panel/80 p-4 shadow-xl md:p-8 dark:border-line-dark dark:bg-canvas-dark/80">
        <Header />
        <main className="mt-8 flex-1 pb-20 md:pb-0">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
