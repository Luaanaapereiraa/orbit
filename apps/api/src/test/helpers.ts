import { generateKeyPair, SignJWT, type GenerateKeyPairResult } from 'jose'
import { Writable } from 'node:stream'
import {
  UnlockPlanSchema,
  type UnlockPlan,
  type UnlockTaskRunRequest,
} from '@destravai/contracts'
import { buildApp, type BuildAppOptions } from '../app.js'
import { createLocalJwtVerifier } from '../auth/jwt-verifier.js'
import type { JwtVerifier } from '../auth/types.js'
import { loadConfig, type AppConfig } from '../config/env.js'
import { readTrustedTaskContext } from '../agents/unlock-task/tools/get-task-context.js'
import { applyValidatedPlan } from '../agents/unlock-task/tools/validate-unlock-plan.js'
import { saveValidatedUnlockPlan } from '../agents/unlock-task/tools/save-unlock-plan.js'
import type { UnlockAgentRunner } from '../agents/unlock-task/runner.js'
import type { ContentModerator } from '../agents/unlock-task/guardrails/input.js'
import type { AgentRunRepository } from '../agents/unlock-task/repositories/types.js'
import { MemoryAgentRunRepository } from '../agents/unlock-task/repositories/memory.js'

export const TEST_ISSUER = 'https://example.supabase.co/auth/v1'
export const TEST_AUDIENCE = 'authenticated'

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...loadConfig({
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '3333',
      LOG_LEVEL: 'silent',
      TRUST_PROXY: 'false',
      CORS_ORIGINS: 'http://localhost:3000',
      ENABLE_API_DOCS: 'false',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      SUPABASE_JWT_AUDIENCE: TEST_AUDIENCE,
    }),
    logLevel: 'silent',
    ...overrides,
  }
}

export function createLogCapture() {
  const chunks: string[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk))
      callback()
    },
  })

  return {
    stream,
    text() {
      return chunks.join('')
    },
  }
}

export async function createTestKeys(): Promise<GenerateKeyPairResult> {
  return generateKeyPair('RS256')
}

export async function signTestJwt(
  privateKey: GenerateKeyPairResult['privateKey'],
  options: {
    subject?: string
    audience?: string
    issuer?: string
    expiresIn?: string | number
    expired?: boolean
    isAnonymous?: boolean
  } = {},
) {
  const jwt = new SignJWT(
    options.isAnonymous === undefined ? {} : { is_anonymous: options.isAnonymous },
  )
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(options.issuer ?? TEST_ISSUER)
    .setAudience(options.audience ?? TEST_AUDIENCE)
    .setSubject(options.subject ?? 'user-1')
    .setIssuedAt()

  if (options.expired) {
    jwt.setExpirationTime(Math.floor(Date.now() / 1000) - 60)
  } else {
    jwt.setExpirationTime(options.expiresIn ?? '5m')
  }

  return jwt.sign(privateKey)
}

export async function createTestVerifier(keys?: GenerateKeyPairResult) {
  const pair = keys ?? (await createTestKeys())
  const verifier = createLocalJwtVerifier({
    key: pair.publicKey,
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
  })
  return { ...pair, verifier }
}

const stubVerifier: JwtVerifier = {
  async verify() {
    throw new Error('unconfigured test verifier')
  },
}

export async function buildTestApp(
  overrides: {
    config?: Partial<AppConfig>
    jwtVerifier?: JwtVerifier
    logger?: BuildAppOptions['logger']
    includeTestRoutes?: boolean
    unlockAgentRunner?: UnlockAgentRunner
    contentModerator?: ContentModerator
    unlockRepositoryFactory?: (input: { userId: string }) => AgentRunRepository
  } = {},
) {
  const app = await buildApp({
    config: testConfig(overrides.config),
    jwtVerifier: overrides.jwtVerifier ?? stubVerifier,
    logger: overrides.logger ?? false,
    includeTestRoutes: overrides.includeTestRoutes ?? true,
    unlockAgentRunner: overrides.unlockAgentRunner,
    contentModerator: overrides.contentModerator,
    unlockRepositoryFactory: overrides.unlockRepositoryFactory,
  })
  return app
}

export function validUnlockRequest(
  overrides: Partial<UnlockTaskRunRequest> = {},
): UnlockTaskRunRequest {
  return {
    clientRequestId: '550e8400-e29b-41d4-a716-446655440000',
    task: {
      id: 'task-1',
      title: 'Preparar apresentacao',
      nextAction: null,
      energy: 'medium',
      estimatedMinutes: 60,
      status: 'active',
    },
    blockageReason: 'dont_know_where_to_start',
    blockageDetails: null,
    availableMinutes: 20,
    currentEnergy: 'medium',
    today: {
      date: '2026-08-28',
      role: 'essential',
      plannedTaskCount: 1,
    },
    locale: 'pt-BR',
    ...overrides,
  }
}

export function validUnlockPlan(
  overrides: Record<string, unknown> = {},
): UnlockPlan {
  return UnlockPlanSchema.parse({
    title: 'Comecar a apresentacao',
    summary: 'Dois passos pequenos para sair do zero.',
    nextAction: 'Abrir o arquivo e escrever o titulo',
    steps: [
      { order: 1, title: 'Abrir o arquivo', minutes: 5 },
      { order: 2, title: 'Escrever o titulo', minutes: 15 },
    ],
    totalMinutes: 20,
    recommendedFocusMinutes: 20,
    energy: 'medium',
    supportiveMessage: 'Um passo pequeno ja conta.',
    ...overrides,
  })
}

export function createCompletedRunner(plan: UnlockPlan = validUnlockPlan()): UnlockAgentRunner {
  return {
    async run(context) {
      readTrustedTaskContext(context)
      applyValidatedPlan(context, plan)
      await saveValidatedUnlockPlan(context, plan)
      return { output: { status: 'completed', plan } }
    },
  }
}

export function createMemoryUnlockRepo() {
  return new MemoryAgentRunRepository()
}
