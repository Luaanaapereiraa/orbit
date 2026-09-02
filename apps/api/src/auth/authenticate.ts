import type { FastifyRequest } from 'fastify'
import { AppError } from '../errors/app-error.js'

export async function authenticate(request: FastifyRequest) {
  const header = request.headers.authorization

  if (!header) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required')
  }

  const [scheme, token] = header.split(' ')

  if (scheme !== 'Bearer' || !token) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required')
  }

  try {
    request.authUser = await request.server.jwtVerifier.verify(token)
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required')
  }
}
