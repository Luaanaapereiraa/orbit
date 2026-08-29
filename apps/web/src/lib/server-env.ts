export function readDestravaiApiUrl() {
  return (process.env.DESTRAVAI_API_URL ?? 'http://localhost:3333').replace(
    /\/$/,
    '',
  )
}
