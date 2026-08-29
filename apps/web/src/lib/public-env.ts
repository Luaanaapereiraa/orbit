export function readPublicApiUrl() {
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333').replace(
    /\/$/,
    '',
  )
}

export function readPublicSupabaseUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
}

export function readPublicSupabasePublishableKey() {
  return (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
}

export function isPublicAuthConfigured() {
  const url = readPublicSupabaseUrl()
  const key = readPublicSupabasePublishableKey()
  return (
    url.length > 0 &&
    key.length > 0 &&
    !key.toLowerCase().startsWith('sb_secret')
  )
}
