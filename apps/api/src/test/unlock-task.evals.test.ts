import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { UNLOCK_EVAL_CASES } from '../agents/unlock-task/evals/cases.js'
import { runOfflineUnlockEvals } from '../agents/unlock-task/evals/offline.js'
import { MemoryAgentRunRepository } from '../agents/unlock-task/repositories/memory.js'
import { createUnlockRunContext } from '../agents/unlock-task/context.js'
import { unlockRunOptions } from '../agents/unlock-task/runner.js'
import { testConfig, validUnlockRequest } from './helpers.js'

describe('unlock-task evals and source guards', () => {
  it('includes at least 20 offline eval cases', () => {
    expect(UNLOCK_EVAL_CASES.length).toBeGreaterThanOrEqual(20)
  })

  it('passes deterministic offline evals through the unlock service', async () => {
    const report = await runOfflineUnlockEvals()
    expect(report.total).toBeGreaterThanOrEqual(20)
    expect(report.passed).toBe(report.total)
    for (const result of report.results) {
      if ('generationMode' in result) {
        expect(result.generationMode).toBe('agent')
      }
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
