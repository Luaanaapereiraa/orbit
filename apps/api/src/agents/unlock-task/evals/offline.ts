import { loadConfig } from '../../../config/env.js'
import { MemoryAgentRunRepository } from '../repositories/memory.js'
import { buildFallbackPlan } from '../fallback.js'
import { collectModerationText, PatternModerator } from '../guardrails/input.js'
import { applyValidatedPlan } from '../tools/validate-unlock-plan.js'
import { saveValidatedUnlockPlan } from '../tools/save-unlock-plan.js'
import { readTrustedTaskContext } from '../tools/get-task-context.js'
import { UnlockTaskService } from '../service.js'
import type { UnlockAgentRunner } from '../runner.js'
import type { UnlockRunContext } from '../context.js'
import { UNLOCK_EVAL_CASES } from './cases.js'
import { metricsPassed, scoreUnlockPlan } from './metrics.js'

const EVAL_USER_ID = '11111111-1111-4111-8111-111111111111'

function offlineConfig() {
  return loadConfig({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '3333',
    LOG_LEVEL: 'silent',
    TRUST_PROXY: 'false',
    CORS_ORIGINS: 'http://localhost:3000',
    ENABLE_API_DOCS: 'false',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    SUPABASE_JWT_AUDIENCE: 'authenticated',
    OPENAI_MODEL: 'eval-model',
    AGENT_REPOSITORY: 'memory',
  })
}

function createProtocolRunner(): UnlockAgentRunner {
  return {
    async run(context: UnlockRunContext) {
      readTrustedTaskContext(context)
      const plan = buildFallbackPlan(context.request)
      applyValidatedPlan(context, plan)
      const saved = await saveValidatedUnlockPlan(context, plan, 'agent')
      if (!saved.saved) {
        throw new Error(saved.error)
      }
      return { output: { status: 'completed', plan: saved.plan } }
    },
  }
}

export async function runOfflineUnlockEvals() {
  const moderator = new PatternModerator()
  const config = offlineConfig()
  const results = []

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
      results.push({
        id: evalCase.id,
        mode: 'offline-service',
        passed: blocked,
        notes: blocked ? 'rejected_by_input_guardrail' : 'unsafe_not_blocked',
      })
      continue
    }

    const repository = new MemoryAgentRunRepository()
    const service = new UnlockTaskService({
      config,
      repository,
      runner: createProtocolRunner(),
    })

    try {
      const response = await service.execute({
        userId: EVAL_USER_ID,
        request: evalCase.request,
      })

      if (response.status !== 'completed') {
        results.push({
          id: evalCase.id,
          mode: 'offline-service',
          passed: false,
          notes: response.status,
        })
        continue
      }

      const stored = await repository.getPlanByRunId({
        runId: response.runId,
        userId: EVAL_USER_ID,
      })
      const plan = stored?.plan ?? response.plan
      const run = repository.peek(EVAL_USER_ID, evalCase.request.clientRequestId)
      const protocolComplete = Boolean(stored) && run?.generationMode === 'agent'
      const metrics = scoreUnlockPlan(plan, evalCase.request, {
        protocolComplete,
        language: evalCase.expect.language,
      })
      results.push({
        id: evalCase.id,
        mode: 'offline-service',
        passed:
          metricsPassed(metrics) &&
          response.generationMode === 'agent' &&
          (!evalCase.expect.injection || !/prescri/i.test(plan.supportiveMessage)),
        metrics,
        generationMode: response.generationMode,
      })
    } catch (error) {
      results.push({
        id: evalCase.id,
        mode: 'offline-service',
        passed: false,
        notes: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  return {
    workflow: 'destravai.unlock-task.v1',
    live: false,
    passed: results.filter((item) => item.passed).length,
    total: results.length,
    results,
  }
}
