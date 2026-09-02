import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  isPublicAuthConfigured,
  readPublicSupabasePublishableKey,
  readPublicSupabaseUrl,
} from '../../../lib/public-env'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

type CallbackPath = '/login?error=callback' | '/login?reset=1' | '/'

function callbackRedirect(request: NextRequest, path: CallbackPath) {
  return NextResponse.redirect(new URL(path, request.url), {
    headers: NO_STORE,
  })
}

function successPath(
  request: NextRequest,
): Exclude<CallbackPath, '/login?error=callback'> {
  if (request.nextUrl.searchParams.get('type') === 'recovery') {
    return '/login?reset=1'
  }

  return '/'
}

export async function GET(request: NextRequest) {
  if (!isPublicAuthConfigured()) {
    return callbackRedirect(request, '/login?error=callback')
  }

  const code = request.nextUrl.searchParams.get('code')
  if (!code) {
    return callbackRedirect(request, '/login?error=callback')
  }

  const redirectResponse = callbackRedirect(request, successPath(request))

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
