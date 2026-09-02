import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MemoryAgentRunRepository } from '../agents/unlock-task/repositories/memory.js'
import { createSupabaseBackendClient } from '../agents/unlock-task/repositories/supabase.js'
import { testConfig, validUnlockPlan, validUnlockRequest } from './helpers.js'

const USER = 'user-1'

describe('unlock-task persistence', () => {
  it('replays terminal runs and conflicts while in progress', async () => {
    const repo = new MemoryAgentRunRepository()
    const input = {
      userId: USER,
      clientRequestId: validUnlockRequest().clientRequestId,
      blockageReason: 'dont_know_where_to_start' as const,
      promptVersion: 'unlock-v1',
      dailyLimit: 5,
    }
    const first = await repo.startRun(input)
    expect(first.kind).toBe('created')
    const second = await repo.startRun(input)
    expect(second.kind).toBe('in_progress')

    if (first.kind !== 'created') {
      throw new Error('expected created')
    }

    await repo.finishRun({
      runId: first.run.id,
      userId: USER,
      status: 'completed',
      response: {
        status: 'completed',
        runId: first.run.id,
        promptVersion: 'unlock-v1',
        generationMode: 'agent',
        createdAt: '2026-08-28T18:00:00.000Z',
        plan: validUnlockPlan(),
      },
      plan: validUnlockPlan(),
      promptVersion: 'unlock-v1',
      generationMode: 'agent',
    })

    const replay = await repo.startRun(input)
    expect(replay.kind).toBe('replay')
    if (replay.kind === 'replay') {
      expect(replay.run.response?.status).toBe('completed')
    }
  })

  it('retries a failed run without consuming extra quota', async () => {
    const repo = new MemoryAgentRunRepository()
    const input = {
      userId: USER,
      clientRequestId: validUnlockRequest().clientRequestId,
      blockageReason: 'dont_know_where_to_start' as const,
      promptVersion: 'unlock-v1',
      dailyLimit: 5,
    }
    const first = await repo.startRun(input)
    if (first.kind !== 'created') {
      throw new Error('expected created')
    }
    await repo.finishRun({
      runId: first.run.id,
      userId: USER,
      status: 'failed',
      response: null,
      promptVersion: 'unlock-v1',
      errorCode: 'BAD_GATEWAY',
    })
    expect(repo.quotaUsed(USER)).toBe(1)
    const retried = await repo.startRun(input)
    expect(retried.kind).toBe('created')
    expect(repo.quotaUsed(USER)).toBe(1)
  })

  it('reserves quota atomically under concurrent starts', async () => {
    const repo = new MemoryAgentRunRepository()
    const starts = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        repo.startRun({
          userId: USER,
          clientRequestId: `550e8400-e29b-41d4-a716-44665544000${index}`,
          blockageReason: 'dont_know_where_to_start',
          promptVersion: 'unlock-v1',
          dailyLimit: 5,
        }),
      ),
    )
    expect(starts.filter((item) => item.kind === 'created')).toHaveLength(5)
    expect(starts.filter((item) => item.kind === 'quota_exceeded')).toHaveLength(3)
    expect(repo.quotaUsed(USER)).toBe(5)
  })

  it('does not create two runs for a concurrent idempotent race', async () => {
    const repo = new MemoryAgentRunRepository()
    const input = {
      userId: USER,
      clientRequestId: validUnlockRequest().clientRequestId,
      blockageReason: 'dont_know_where_to_start' as const,
      promptVersion: 'unlock-v1',
      dailyLimit: 5,
    }
    const [a, b] = await Promise.all([repo.startRun(input), repo.startRun(input)])
    const kinds = [a.kind, b.kind].sort()
    expect(kinds).toEqual(['created', 'in_progress'])
  })

  it('saves one plan per run even if save is repeated', async () => {
    const repo = new MemoryAgentRunRepository()
    const started = await repo.startRun({
      userId: USER,
      clientRequestId: validUnlockRequest().clientRequestId,
      blockageReason: 'dont_know_where_to_start',
      promptVersion: 'unlock-v1',
      dailyLimit: 5,
    })
    if (started.kind !== 'created') {
      throw new Error('expected created')
    }
    const first = await repo.savePlan({
      runId: started.run.id,
      userId: USER,
      plan: validUnlockPlan(),
      generationMode: 'agent',
    })
    const second = await repo.savePlan({
      runId: started.run.id,
      userId: USER,
      plan: validUnlockPlan({ title: 'Ignorado' }),
      generationMode: 'agent',
    })
    expect(first.kind).toBe('saved')
    expect(second.kind).toBe('saved')
    if (first.kind === 'saved' && second.kind === 'saved') {
      expect(first.planId).toBe(second.planId)
    }
    const stored = await repo.getPlanByRunId({
      runId: started.run.id,
      userId: USER,
    })
    expect(stored?.plan.title).toBe('Comecar a apresentacao')
  })

  it('does not leak another user run', async () => {
    const repo = new MemoryAgentRunRepository()
    const started = await repo.startRun({
      userId: USER,
      clientRequestId: validUnlockRequest().clientRequestId,
      blockageReason: 'dont_know_where_to_start',
      promptVersion: 'unlock-v1',
      dailyLimit: 5,
    })
    if (started.kind !== 'created') {
      throw new Error('expected created')
    }
    await repo.savePlan({
      runId: started.run.id,
      userId: USER,
      plan: validUnlockPlan(),
      generationMode: 'agent',
    })
    const leaked = await repo.getPlanByRunId({
      runId: started.run.id,
      userId: 'other-user',
    })
    expect(leaked).toBeNull()
  })

  it('creates the backend client with the server secret and no user JWT', () => {
    const secret = 'sb_secret_test_backend'
    const config = testConfig({
      supabaseSecretKey: secret,
      agentRepository: 'supabase',
    })
    const client = createSupabaseBackendClient(config)
    expect(config.supabasePublishableKey).not.toBe(secret)
    expect(config.supabaseSecretKey).toBe(secret)
    expect(createSupabaseBackendClient.length).toBe(1)
    expect(client).toBeTruthy()
  })

  it('forwards the authenticated user id on every RPC and ignores a user access token', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/agents/unlock-task/repositories/supabase.ts'),
      'utf8',
    )
    expect(source).toMatch(/p_user_id: input.userId/)
    expect(source).toMatch(/createClient\(config.supabaseUrl, config.supabaseSecretKey/)
    expect(source).not.toMatch(/accessToken/)
    expect(source).not.toMatch(/user-access-token/)
    expect(source).not.toMatch(/Bearer /)
    expect(source).toMatch(/persistence_failed/)
  })

  it('does not reference the hosted secret role name in TypeScript persistence code', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/agents/unlock-task/repositories/supabase.ts'),
      'utf8',
    )
    expect(source).not.toMatch(/service_role/)
    const sql = readFileSync(
      resolve(
        process.cwd(),
        '../../supabase/migrations/20260829120000_unlock_task_backend_authority.sql',
      ),
      'utf8',
    )
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.start_unlock_agent_run/)
    expect(sql).toMatch(/FROM anon, authenticated/)
  })
})
