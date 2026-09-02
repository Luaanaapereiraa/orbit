import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MemoryAgentRunRepository } from '../repositories/memory.js'
import { UNLOCK_EVAL_CASES } from './cases.js'
import { runOfflineUnlockEvals } from './offline.js'

function reportPath() {
  const outDir = resolve(process.cwd(), '.eval-results')
  mkdirSync(outDir, { recursive: true })
  return resolve(outDir, `unlock-task-${Date.now()}.json`)
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
  const report = live ? await runLive() : await runOfflineUnlockEvals()
  const file = reportPath()
  writeFileSync(file, JSON.stringify(report, null, 2))
  process.stdout.write(`${file}\n`)
  process.stdout.write(`${report.passed}/${report.total} passed\n`)
  if (report.passed !== report.total) {
    process.exitCode = 1
  }
}

void main()
