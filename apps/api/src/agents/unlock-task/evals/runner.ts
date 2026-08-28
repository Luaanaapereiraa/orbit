import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MemoryAgentRunRepository } from '../repositories/memory.js'
import { createUnlockRunContext } from '../context.js'
import { buildFallbackPlan } from '../fallback.js'
import { collectModerationText, PatternModerator } from '../guardrails/input.js'
import { applyValidatedPlan } from '../tools/validate-unlock-plan.js'
import { saveValidatedUnlockPlan } from '../tools/save-unlock-plan.js'
import { readTrustedTaskContext } from '../tools/get-task-context.js'
import { UNLOCK_EVAL_CASES } from './cases.js'
import { metricsPassed, scoreUnlockPlan } from './metrics.js'

function reportPath() {
  const outDir = resolve(process.cwd(), '.eval-results')
  mkdirSync(outDir, { recursive: true })
  return resolve(outDir, `unlock-task-${Date.now()}.json`)
}

async function runOffline() {
  const moderator = new PatternModerator()
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
        mode: 'offline',
        passed: blocked,
        notes: blocked ? 'rejected_by_input_guardrail' : 'unsafe_not_blocked',
      })
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
      results.push({
        id: evalCase.id,
        mode: 'offline',
        passed: false,
        notes: started.kind,
      })
      continue
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
      protocolComplete:
        context.protocol[0] === 'get_task_context' &&
        context.protocol.includes('validate_unlock_plan') &&
        context.protocol.includes('save_unlock_plan'),
      language: evalCase.expect.language,
    })
    results.push({
      id: evalCase.id,
      mode: 'offline',
      passed:
        metricsPassed(metrics) &&
        !blocked &&
        (!evalCase.expect.injection || !/prescri/i.test(plan.supportiveMessage)),
      metrics,
    })
  }

  return {
    workflow: 'destravai.unlock-task.v1',
    live: false,
    passed: results.filter((item) => item.passed).length,
    total: results.length,
    results,
  }
}

async function runLive() {
  const { loadConfig } = await import('../../../config/env.js')
  const { createSdkUnlockAgentRunner } = await import('../runner.js')
  const { UnlockTaskService } = await import('../service.js')

  const config = loadConfig({
    ...process.env,
    NODE_ENV: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  })

  if (!config.openaiApiKey || !config.openaiModel) {
    throw new Error('OPENAI_API_KEY and OPENAI_MODEL are required for live evals')
  }

  const runner = createSdkUnlockAgentRunner(config)
  const results = []

  for (const evalCase of UNLOCK_EVAL_CASES) {
    const repository = new MemoryAgentRunRepository()
    const service = new UnlockTaskService({ config, repository, runner })
    try {
      const response = await service.execute({
        userId: '11111111-1111-4111-8111-111111111111',
        request: {
          ...evalCase.request,
          clientRequestId: crypto.randomUUID(),
        },
      })
      const passed = evalCase.expect.unsafe
        ? response.status === 'rejected'
        : response.status === 'completed' || response.status === 'needs_clarification'
      results.push({
        id: evalCase.id,
        mode: 'live',
        passed,
        status: response.status,
      })
    } catch (error) {
      results.push({
        id: evalCase.id,
        mode: 'live',
        passed: false,
        error: error instanceof Error ? error.name : 'unknown',
      })
    }
  }

  return {
    workflow: 'destravai.unlock-task.v1',
    live: true,
    passed: results.filter((item) => item.passed).length,
    total: results.length,
    results,
  }
}

async function main() {
  const live = process.env.RUN_LIVE_AGENT_TESTS === 'true'
  const report = live ? await runLive() : await runOffline()
  const file = reportPath()
  writeFileSync(file, JSON.stringify(report, null, 2))
  process.stdout.write(`${file}\n`)
  process.stdout.write(`${report.passed}/${report.total} passed\n`)
  if (report.passed !== report.total) {
    process.exitCode = 1
  }
}

void main()
