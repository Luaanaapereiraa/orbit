import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { buildApp } from './app.js'
import { loadConfig } from './config/env.js'

function loadLocalEnv() {
  const envPath = resolve(process.cwd(), '.env')
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath })
  }
}

export async function startServer() {
  loadLocalEnv()
  const config = loadConfig(process.env)
  const app = await buildApp({ config })

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down')
    try {
      await app.close()
      process.exit(0)
    } catch (error) {
      app.log.error({ err: error }, 'shutdown failed')
      process.exit(1)
    }
  }

  process.once('SIGINT', () => {
    void shutdown('SIGINT')
  })
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM')
  })

  await app.listen({ host: config.host, port: config.port })
  return app
}

if (!process.env.VITEST) {
  startServer().catch((error: unknown) => {
    console.error('Failed to start API')
    if (error instanceof Error) {
      console.error(error.message)
    }
    process.exit(1)
  })
}
