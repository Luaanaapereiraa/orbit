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
    } else if (/\.(ts|tsx|js|mjs|example)$/.test(entry.name)) {
      files.push(path)
    }
  }
  return files
}

describe('unlock-task web surface', () => {
  it('never ships the server secret or talks to agent tables', () => {
    const root = resolve(process.cwd(), 'src')
    const files = [
      ...walk(root),
      resolve(process.cwd(), '.env.example'),
      resolve(process.cwd(), 'package.json'),
    ]
    const joined = files.map((file) => readFileSync(file, 'utf8')).join('\n')

    expect(joined).not.toMatch(/SUPABASE_SECRET_KEY/)
    expect(joined).not.toMatch(/NEXT_PUBLIC_SUPABASE_SECRET/)
    expect(joined).not.toMatch(/SERVICE_ROLE/)
    expect(joined).not.toMatch(/agent_runs/)
    expect(joined).not.toMatch(/unlock_plans/)
    expect(joined).not.toMatch(/agent_daily_usage/)
    expect(joined).not.toMatch(/\.rpc\(/)
    expect(joined).toMatch(/\/v1\/agents\/unlock-task\/runs/)
  })
})
