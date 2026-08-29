import type { AppConfig } from '../config/env.js'
import type { AuthUser, JwtVerifier } from '../auth/types.js'
import type { UnlockAgentRunner } from '../agents/unlock-task/runner.js'
import type { ContentModerator } from '../agents/unlock-task/guardrails/input.js'
import type { AgentRunRepository } from '../agents/unlock-task/repositories/types.js'
import type { MemoryAgentRunRepository } from '../agents/unlock-task/repositories/memory.js'

declare module 'fastify' {
  interface FastifyInstance {
    appConfig: AppConfig
    jwtVerifier: JwtVerifier
    unlockAgentRunner?: UnlockAgentRunner
    contentModerator?: ContentModerator
    memoryAgentRepository?: MemoryAgentRunRepository
    unlockRepositoryFactory?: (input: { userId: string }) => AgentRunRepository
  }

  interface FastifyRequest {
    authUser?: AuthUser | null
  }
}
