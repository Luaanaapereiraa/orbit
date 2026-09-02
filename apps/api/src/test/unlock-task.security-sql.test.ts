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

const TRIGGER_REVOKE_MIGRATION = resolve(
  MIGRATIONS_DIR,
  '20260831220000_revoke_trigger_function_execute.sql',
)

function readLatest() {
  return readFileSync(MIGRATIONS[MIGRATIONS.length - 1], 'utf8')
}

function stripSqlComments(sql: string) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')
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

describe('unlock-task trigger function execute revoke', () => {
  it('lists the corrective migration after the five applied files', () => {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith('.sql'))
      .sort()
    expect(files).toEqual([
      '20260828120000_agent_runs.sql',
      '20260828120100_unlock_plans.sql',
      '20260828180000_unlock_task_quota.sql',
      '20260828220000_unlock_task_security.sql',
      '20260829120000_unlock_task_backend_authority.sql',
      '20260831220000_revoke_trigger_function_execute.sql',
    ])
  })

  it('revokes execute on the three trigger signatures from PUBLIC, anon, authenticated and service_role', () => {
    const sql = stripSqlComments(readFileSync(TRIGGER_REVOKE_MIGRATION, 'utf8'))
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.touch_agent_runs_updated_at\(\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    )
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.prevent_agent_run_identity_change\(\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    )
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.enforce_unlock_plan_owner\(\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    )
  })

  it('hardens search_path only on the trigger function that lacked it', () => {
    const sql = stripSqlComments(readFileSync(TRIGGER_REVOKE_MIGRATION, 'utf8'))
    expect(sql).toMatch(
      /ALTER FUNCTION public\.touch_agent_runs_updated_at\(\)\s+SET search_path = pg_catalog;/,
    )
    expect(sql).not.toMatch(/ALTER FUNCTION public\.prevent_agent_run_identity_change/)
    expect(sql).not.toMatch(/ALTER FUNCTION public\.enforce_unlock_plan_owner/)
  })

  it('does not change tables, policies, RPCs, quota, lease or contracts', () => {
    const sql = stripSqlComments(readFileSync(TRIGGER_REVOKE_MIGRATION, 'utf8'))
    expect(sql).not.toMatch(/CREATE\s+TABLE/)
    expect(sql).not.toMatch(/ALTER\s+TABLE/)
    expect(sql).not.toMatch(/DROP\s+TABLE/)
    expect(sql).not.toMatch(/CREATE\s+POLICY/)
    expect(sql).not.toMatch(/DROP\s+POLICY/)
    expect(sql).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION/)
    expect(sql).not.toMatch(/DROP\s+FUNCTION/)
    expect(sql).not.toMatch(/DROP\s+TRIGGER/)
    expect(sql).not.toMatch(/CREATE\s+TRIGGER/)
    expect(sql).not.toMatch(/GRANT\s+/)
    expect(sql).not.toMatch(/agent_quota_settings/)
    expect(sql).not.toMatch(/daily_limit/)
    expect(sql).not.toMatch(/lease_seconds/)
    expect(sql).not.toMatch(/start_unlock_agent_run/)
    expect(sql).not.toMatch(/save_unlock_agent_plan/)
    expect(sql).not.toMatch(/begin_unlock_fallback/)
    expect(sql).not.toMatch(/finish_unlock_agent_run/)
  })

  it('keeps the original trigger bindings in earlier migrations', () => {
    const quota = readFileSync(MIGRATIONS[2], 'utf8')
    const security = readFileSync(MIGRATIONS[3], 'utf8')
    expect(quota).toMatch(
      /CREATE TRIGGER agent_runs_touch_updated_at\s+BEFORE UPDATE ON public\.agent_runs[\s\S]*EXECUTE FUNCTION public\.touch_agent_runs_updated_at\(\)/,
    )
    expect(security).toMatch(
      /CREATE TRIGGER agent_runs_identity_immutable\s+BEFORE UPDATE ON public\.agent_runs[\s\S]*EXECUTE FUNCTION public\.prevent_agent_run_identity_change\(\)/,
    )
    expect(security).toMatch(
      /CREATE TRIGGER unlock_plans_owner_guard\s+BEFORE INSERT OR UPDATE ON public\.unlock_plans[\s\S]*EXECUTE FUNCTION public\.enforce_unlock_plan_owner\(\)/,
    )
    expect(stripSqlComments(readFileSync(TRIGGER_REVOKE_MIGRATION, 'utf8'))).not.toMatch(
      /DROP\s+TRIGGER/,
    )
  })

  it('leaves the four final RPCs granted only to service_role in the authority migration', () => {
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
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.start_unlock_agent_run\(uuid, uuid, text, text\) FROM anon, authenticated/,
    )
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.insert_unlock_plan_locked\(public\.agent_runs, jsonb\) FROM anon, authenticated, service_role/,
    )
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
