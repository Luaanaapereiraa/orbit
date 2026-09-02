import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  readPublicSupabasePublishableKey,
  readPublicSupabaseUrl,
} from '../public-env'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    readPublicSupabaseUrl(),
    readPublicSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Server Components cannot always write cookies.
          }
        },
      },
    },
  )
}
