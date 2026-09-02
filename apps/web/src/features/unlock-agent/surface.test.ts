import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function walk(dir: string, files: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === '.next' ||
      entry.name === 'dist'
    ) {
      continue
    }
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      walk(path, files)
    } else if (
      /\.(ts|tsx|js|mjs|example)$/.test(entry.name) &&
      !/\.test\.(ts|tsx)$/.test(entry.name)
    ) {
      files.push(path)
    }
  }
  return files
}

const forbidden = {
  secret: ['SUPABASE', 'SECRET', 'KEY'].join('_'),
  publicSecret: ['NEXT_PUBLIC_SUPABASE', 'SECRET'].join('_'),
  service: ['SERVICE', 'ROLE'].join('_'),
  openai: ['OPENAI', 'API', 'KEY'].join('_'),
  openaiSdk: ['@openai', 'agents'].join('/'),
  runs: ['agent', 'runs'].join('_'),
  plans: ['unlock', 'plans'].join('_'),
  usage: ['agent', 'daily', 'usage'].join('_'),
}

describe('unlock-agent web surface', () => {
  it('never ships secrets, agent tables or the OpenAI SDK', () => {
    const root = resolve(process.cwd(), 'src')
    const files = [
      ...walk(root),
      resolve(process.cwd(), '.env.example'),
      resolve(process.cwd(), 'package.json'),
    ]
    const joined = files.map((file) => readFileSync(file, 'utf8')).join('\n')

    expect(joined).not.toMatch(new RegExp(forbidden.secret))
    expect(joined).not.toMatch(new RegExp(forbidden.publicSecret))
    expect(joined).not.toMatch(new RegExp(forbidden.service))
    expect(joined).not.toMatch(new RegExp(forbidden.openai))
    expect(joined).not.toMatch(new RegExp(forbidden.openaiSdk))
    expect(joined).not.toMatch(new RegExp(forbidden.runs))
    expect(joined).not.toMatch(new RegExp(forbidden.plans))
    expect(joined).not.toMatch(new RegExp(forbidden.usage))
    expect(joined).not.toMatch(/\.rpc\(/)
    expect(joined).toMatch(/\/api\/agents\/unlock-task\/runs/)
    expect(joined).toMatch(/DESTRAVAI_API_URL/)
  })
})
