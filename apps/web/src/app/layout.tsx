import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono as JetBrainsMono } from 'next/font/google'
import type { ReactNode } from 'react'
import { AuthProvider } from '../contexts/AuthContext'
import { PomodoroProvider } from '../contexts/PomodoroContext'
import { PwaRegister } from '../components/PwaRegister'
import { APP_DESCRIPTION, APP_NAME } from '../lib/brand'
import { THEME_BOOTSTRAP } from '../lib/theme-bootstrap'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-sans',
})

const jetbrains = JetBrainsMono({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: APP_NAME,
  description: APP_DESCRIPTION,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: APP_NAME,
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#0b1220',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`dark ${inter.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="font-sans">
        <PwaRegister>
          <PomodoroProvider>
            <AuthProvider>{children}</AuthProvider>
          </PomodoroProvider>
        </PwaRegister>
      </body>
    </html>
  )
}
