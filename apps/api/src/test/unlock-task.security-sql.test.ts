import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATIONS = [
  '20260828120000_agent_runs.sql',
  '20260828120100_unlock_plans.sql',
  '20260828180000_unlock_task_quota.sql',
  '20260828220000_unlock_task_security.sql',
].map((file) =>
  resolve(process.cwd(), '../../supabase/migrations', file),
)

function readLatest() {
  return readFileSync(MIGRATIONS[MIGRATIONS.length - 1], 'utf8')
}

function readAll() {
  return MIGRATIONS.map((file) => readFileSync(file, 'utf8')).join('\n')
}

describe('unlock-task SQL security migration', () => {
  it('uses SECURITY DEFINER with a safe search_path and no public daily limit argument', () => {
    const sql = readLatest()
    expect(sql).toMatch(/SECURITY DEFINER/)
    expect(sql).toMatch(/SET search_path = pg_catalog/)
    expect(sql).not.toMatch(/p_daily_limit/)
    expect(sql).not.toMatch(/p_user_id/)
    expect(sql).toMatch(/auth\.uid\(\)/)
    expect(sql).toMatch(/require_authenticated_uid/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.agent_quota_settings/)
  })

  it('revokes direct writes from authenticated and anon on agent tables', () => {
    const sql = readLatest()
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.agent_runs FROM authenticated/,
    )
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.unlock_plans FROM authenticated/,
    )
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.agent_daily_usage FROM authenticated/,
    )
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.agent_runs TO authenticated/)
    expect(sql).toMatch(
      /GRANT SELECT ON TABLE public\.unlock_plans TO authenticated/,
    )
    expect(sql).not.toMatch(
      /GRANT (SELECT, )?INSERT, UPDATE ON TABLE public\.agent_daily_usage TO authenticated/,
    )
    expect(sql).not.toMatch(
      /GRANT INSERT, UPDATE ON TABLE public\.agent_runs TO authenticated/,
    )
  })

  it('does not leave GRANT UPDATE/INSERT/DELETE to authenticated in the corrective migration', () => {
    const sql = readLatest()
    expect(sql).not.toMatch(/GRANT UPDATE[^\n]*TO authenticated/)
    expect(sql).not.toMatch(/GRANT INSERT[^\n]*TO authenticated/)
    expect(sql).not.toMatch(/GRANT DELETE[^\n]*TO authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.start_unlock_agent_run/)
  })

  it('models allowed run transitions and composite plan ownership', () => {
    const sql = readLatest()
    expect(sql).toMatch(/fallback_pending/)
    expect(sql).toMatch(/unlock_plans_run_user_fkey/)
    expect(sql).toMatch(/REFERENCES public\.agent_runs \(id, user_id\)/)
    expect(sql).toMatch(/invalid run transition/)
    expect(sql).toMatch(/begin_unlock_fallback/)
    expect(sql).toMatch(/save_unlock_agent_plan/)
    expect(sql).toMatch(/lease_expires_at/)
  })

  it('never references service_role and revokes PUBLIC execute on mutation RPCs', () => {
    const all = readAll()
    expect(all).not.toMatch(/service_role/)
    const sql = readLatest()
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.start_unlock_agent_run\(uuid, text, text\) FROM PUBLIC/,
    )
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.finish_unlock_agent_run/,
    )
  })

  it('documents that common tests do not execute against a live Postgres', () => {
    expect(readLatest()).toMatch(/Operators change it/)
  })
})
