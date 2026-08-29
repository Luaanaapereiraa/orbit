import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = resolve(process.cwd(), '../../supabase/migrations')

const MIGRATIONS = [
  '20260828120000_agent_runs.sql',
  '20260828120100_unlock_plans.sql',
  '20260828180000_unlock_task_quota.sql',
  '20260828220000_unlock_task_security.sql',
  '20260829120000_unlock_task_backend_authority.sql',
].map((file) => resolve(MIGRATIONS_DIR, file))

function readLatest() {
  return readFileSync(MIGRATIONS[MIGRATIONS.length - 1], 'utf8')
}

function walkSourceFiles(dir: string, files: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') {
      continue
    }
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      walkSourceFiles(path, files)
    } else if (/\.(ts|tsx|js|mjs|json|example)$/.test(entry.name)) {
      files.push(path)
    }
  }
  return files
}

describe('unlock-task SQL security migration', () => {
  it('uses SECURITY DEFINER with a safe search_path in the backend-authority migration', () => {
    const sql = readLatest()
    expect(sql).toMatch(/SECURITY DEFINER/)
    expect(sql).toMatch(/SET search_path = pg_catalog/)
    expect(sql).not.toMatch(/p_daily_limit/)
    expect(sql).toMatch(/p_user_id/)
    expect(sql).toMatch(/require_agent_api_user/)
    expect(sql).not.toMatch(/CREATE ROLE\s+\w+/)
    expect(sql).not.toMatch(/destravai_agent_api/)
  })

  it('revokes execute on agent RPCs from PUBLIC, anon and authenticated', () => {
    const sql = readLatest()
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.start_unlock_agent_run\(uuid, uuid, text, text\) FROM PUBLIC/,
    )
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.start_unlock_agent_run\(uuid, uuid, text, text\) FROM anon, authenticated/,
    )
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.save_unlock_agent_plan\(uuid, uuid, jsonb, text\) FROM anon, authenticated/,
    )
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.begin_unlock_fallback\(uuid, uuid\) FROM anon, authenticated/,
    )
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.finish_unlock_agent_run\(uuid, uuid, text, text, jsonb, text, text, integer, integer, integer, integer, text, jsonb\) FROM anon, authenticated/,
    )
    expect(sql).not.toMatch(/GRANT EXECUTE[^\n]*TO authenticated/)
    expect(sql).not.toMatch(/GRANT EXECUTE[^\n]*TO anon/)
    expect(sql).not.toMatch(/GRANT EXECUTE[^\n]*TO PUBLIC/)
  })

  it('grants execute only to the hosted secret role', () => {
    const sql = readLatest()
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.start_unlock_agent_run\(uuid, uuid, text, text\) TO service_role/,
    )
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.save_unlock_agent_plan\(uuid, uuid, jsonb, text\) TO service_role/,
    )
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.begin_unlock_fallback\(uuid, uuid\) TO service_role/,
    )
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.finish_unlock_agent_run\(uuid, uuid, text, text, jsonb, text, text, integer, integer, integer, integer, text, jsonb\) TO service_role/,
    )
    expect(sql).not.toMatch(/GRANT EXECUTE[^\n]*TO destravai_agent_api/)
  })

  it('drops previous public signatures and keeps helpers off the user surface', () => {
    const sql = readLatest()
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.start_unlock_agent_run\(uuid, text, text\)/)
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.save_unlock_agent_plan\(uuid, jsonb, text\)/)
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.begin_unlock_fallback\(uuid\)/)
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.insert_unlock_plan_locked\(public\.agent_runs, jsonb\) FROM anon, authenticated, service_role/,
    )
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.require_agent_api_user\(uuid\) FROM anon, authenticated, service_role/,
    )
  })

  it('preserves fallback_pending on lease recovery and classifies persisted plans by mode', () => {
    const sql = readLatest()
    expect(sql).toMatch(/SET status = 'fallback_pending'/)
    expect(sql).toMatch(/kind', 'persisted_plan_won'/)
    expect(sql).toMatch(/kind', 'fallback_claimed'/)
    expect(sql).not.toMatch(/agent_won/)
    expect(sql).not.toMatch(/timeout_won/)
    expect(sql).toMatch(/AND user_id = caller/)
  })

  it('keeps table write revokes from the previous corrective migration', () => {
    const previous = readFileSync(MIGRATIONS[3], 'utf8')
    expect(previous).toMatch(/REVOKE ALL ON TABLE public\.agent_runs FROM authenticated/)
    expect(previous).toMatch(/GRANT SELECT ON TABLE public\.agent_runs TO authenticated/)
  })

  it('documents that common tests do not execute against a live Postgres', () => {
    expect(readLatest()).toMatch(/Definitive proof is the live Postgres catalog/)
  })

  it('does not grant mutation RPCs to authenticated anywhere in the latest file', () => {
    const sql = readLatest()
    const executeToAuthenticated = /GRANT EXECUTE[\s\S]{0,80}TO authenticated/g
    expect(sql.match(executeToAuthenticated)).toBeNull()
  })
})

describe('unlock-task credential surface', () => {
  it('keeps the server secret out of the web workspace', () => {
    const webRoot = resolve(process.cwd(), '../../apps/web')
    const files = walkSourceFiles(webRoot)
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/SUPABASE_SECRET_KEY/)
      expect(source).not.toMatch(/NEXT_PUBLIC_SUPABASE_SECRET/)
    }
  })

  it('does not expose a public prefix for the API secret env name', () => {
    const example = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8')
    expect(example).toMatch(/^SUPABASE_SECRET_KEY=$/m)
    expect(example).not.toMatch(/NEXT_PUBLIC_SUPABASE_SECRET/)
    expect(example).toMatch(/^OPENAI_AGENT_TRACING_ENABLED=false$/m)
  })
})
