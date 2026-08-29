export class ServerEnvError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServerEnvError'
  }
}

function stripTrailingSlash(url: URL) {
  const path = url.pathname.replace(/\/+$/, '')
  return `${url.origin}${path}${url.search}`
}

export function readDestravaiApiUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.DESTRAVAI_API_URL?.trim()
  if (!raw) {
    throw new ServerEnvError(
      'DESTRAVAI_API_URL não está configurada. Defina a URL da API no ambiente do servidor.',
    )
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new ServerEnvError('DESTRAVAI_API_URL não é uma URL válida.')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ServerEnvError('DESTRAVAI_API_URL deve usar http ou https.')
  }

  if (env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new ServerEnvError('DESTRAVAI_API_URL deve usar https em produção.')
  }

  if (parsed.username || parsed.password) {
    throw new ServerEnvError(
      'DESTRAVAI_API_URL não pode incluir credenciais.',
    )
  }

  return stripTrailingSlash(parsed)
}
