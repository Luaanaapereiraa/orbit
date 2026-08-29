import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { safeNextPath } from '../../../lib/auth/safe-next'
import {
  isPublicAuthConfigured,
  readPublicSupabasePublishableKey,
  readPublicSupabaseUrl,
} from '../../../lib/public-env'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const next = safeNextPath(url.searchParams.get('next'))
  const code = url.searchParams.get('code')

  if (!isPublicAuthConfigured() || !code) {
    return NextResponse.redirect(new URL('/login?error=callback', url.origin))
  }

  const cookieStore = await cookies()
  const createClient = createServerClient as unknown as (
    supabaseUrl: string,
    supabaseKey: string,
    options: {
      cookies: {
        getAll: () => { name: string; value: string }[]
        setAll: (
          cookiesToSet: {
            name: string
            value: string
            options?: Record<string, unknown>
          }[],
        ) => void
      }
    },
  ) => SupabaseClient

  const supabase = createClient(
    readPublicSupabaseUrl(),
    readPublicSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    },
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL('/login?error=callback', url.origin))
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
