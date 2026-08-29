import { type NextRequest } from 'next/server'
import { PROXY_MATCHER, updateSession } from './lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [PROXY_MATCHER],
}
