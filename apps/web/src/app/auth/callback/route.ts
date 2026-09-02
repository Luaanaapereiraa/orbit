import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  isPublicAuthConfigured,
  readPublicSupabasePublishableKey,
  readPublicSupabaseUrl,
} from '../../../lib/public-env'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

function callbackRedirect(
  request: NextRequest,
  path: '/login?error=callback' | '/',
) {
  return NextResponse.redirect(new URL(path, request.url), {
    headers: NO_STORE,
  })
}

export async function GET(request: NextRequest) {
  if (!isPublicAuthConfigured()) {
    return callbackRedirect(request, '/login?error=callback')
  }

  const code = request.nextUrl.searchParams.get('code')
  if (!code) {
    return callbackRedirect(request, '/login?error=callback')
  }

  const redirectResponse = callbackRedirect(request, '/')

  const supabase = createServerClient(
    readPublicSupabaseUrl(),
    readPublicSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            redirectResponse.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return callbackRedirect(request, '/login?error=callback')
  }

  return redirectResponse
}
