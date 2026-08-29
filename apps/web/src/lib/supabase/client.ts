import { createBrowserClient } from '@supabase/ssr'
import {
  readPublicSupabasePublishableKey,
  readPublicSupabaseUrl,
} from '../public-env'

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    readPublicSupabaseUrl(),
    readPublicSupabasePublishableKey(),
  )
}
