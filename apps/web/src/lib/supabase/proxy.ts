import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  isPublicAuthConfigured,
  readPublicSupabasePublishableKey,
  readPublicSupabaseUrl,
} from '../public-env'

export const PROXY_MATCHER =
  '/((?!_next/static|_next/image|favicon.ico|favicon.svg|sw.js|serwist/|manifest.webmanifest|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)'

export function shouldHandleAuthProxy(pathname: string) {
  if (pathname.startsWith('/_next/static')) {
    return false
  }
  if (pathname.startsWith('/_next/image')) {
    return false
  }
  if (pathname === '/favicon.ico' || pathname === '/favicon.svg') {
    return false
  }
  if (pathname === '/sw.js' || pathname.startsWith('/serwist/')) {
    return false
  }
  if (
    pathname === '/manifest.webmanifest' ||
    pathname === '/manifest.json'
  ) {
    return false
  }
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$/i.test(pathname)) {
    return false
  }
  return true
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })
  supabaseResponse.headers.set('Cache-Control', 'private, no-store')

  if (!isPublicAuthConfigured()) {
    return supabaseResponse
  }

  const supabase = createServerClient(
    readPublicSupabaseUrl(),
    readPublicSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          supabaseResponse = NextResponse.next({
            request,
          })
          supabaseResponse.headers.set('Cache-Control', 'private, no-store')
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  await supabase.auth.getClaims()

  return supabaseResponse
}
