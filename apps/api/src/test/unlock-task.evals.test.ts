import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { UNLOCK_EVAL_CASES } from '../agents/unlock-task/evals/cases.js'
import { metricsPassed, scoreUnlockPlan } from '../agents/unlock-task/evals/metrics.js'
import { buildFallbackPlan } from '../agents/unlock-task/fallback.js'
import { collectModerationText, PatternModerator } from '../agents/unlock-task/guardrails/input.js'
import { MemoryAgentRunRepository } from '../agents/unlock-task/repositories/memory.js'
import { createUnlockRunContext } from '../agents/unlock-task/context.js'
import { readTrustedTaskContext } from '../agents/unlock-task/tools/get-task-context.js'
import { applyValidatedPlan } from '../agents/unlock-task/tools/validate-unlock-plan.js'
import { saveValidatedUnlockPlan } from '../agents/unlock-task/tools/save-unlock-plan.js'
import { unlockRunOptions } from '../agents/unlock-task/runner.js'
import { testConfig, validUnlockRequest } from './helpers.js'

describe('unlock-task evals and source guards', () => {
  it('includes at least 20 offline eval cases', () => {
    expect(UNLOCK_EVAL_CASES.length).toBeGreaterThanOrEqual(20)
  })

  it('passes deterministic offline eval metrics', async () => {
    const moderator = new PatternModerator()
    for (const evalCase of UNLOCK_EVAL_CASES) {
      const blocked = (
        await moderator.inspect(
          collectModerationText({
            title: evalCase.request.task.title,
            nextAction: evalCase.request.task.nextAction,
            blockageDetails: evalCase.request.blockageDetails,
          }),
        )
      ).blocked
      if (evalCase.expect.unsafe) {
        expect(blocked).toBe(true)
        continue
      }
      const repository = new MemoryAgentRunRepository()
      const started = await repository.startRun({
        userId: 'eval-user',
        clientRequestId: evalCase.request.clientRequestId,
        blockageReason: evalCase.request.blockageReason,
        promptVersion: 'unlock-v1',
        dailyLimit: 50,
      })
      if (started.kind !== 'created') {
        throw new Error(started.kind)
      }
      const context = createUnlockRunContext({
        runId: started.run.id,
        userId: 'eval-user',
        request: evalCase.request,
        repository,
      })
      readTrustedTaskContext(context)
      const plan = buildFallbackPlan(evalCase.request)
      applyValidatedPlan(context, plan)
      await saveValidatedUnlockPlan(context, plan)
      const metrics = scoreUnlockPlan(plan, evalCase.request, {
        protocolComplete: true,
        language: evalCase.expect.language,
      })
      expect(metricsPassed(metrics)).toBe(true)
    }
  })

  it('does not import Assistants API, LangChain or hardcoded model names in the agent', () => {
    const root = resolve(process.cwd(), 'src')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = resolve(dir, entry.name)
        if (entry.isDirectory()) {
          walk(path)
        } else if (entry.name.endsWith('.ts')) {
          files.push(path)
        }
      }
    }
    walk(root)
    const production = files.filter(
      (file) => !file.includes('\\test\\') && !file.includes('/test/'),
    )
    const joined = production.map((file) => readFileSync(file, 'utf8')).join('\n')
    expect(joined).not.toMatch(/from ['"]langchain/)
    expect(joined).not.toMatch(/openai\.beta\.assistants/)
    expect(joined).not.toMatch(/service_role/)
    expect(joined).not.toMatch(/agent_won/)
    expect(joined).not.toMatch(/sk-[a-zA-Z0-9]{20,}/)
    expect(unlockRunOptions(testConfig(), createUnlockRunContext({
      runId: 'run',
      userId: 'user',
      request: validUnlockRequest(),
      repository: new MemoryAgentRunRepository(),
    })).maxTurns).toBe(8)
    expect(unlockRunOptions(testConfig(), createUnlockRunContext({
      runId: 'run',
      userId: 'user',
      request: validUnlockRequest(),
      repository: new MemoryAgentRunRepository(),
    })).parallelToolCalls).toBe(false)
  })
})
