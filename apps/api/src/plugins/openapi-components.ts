const healthResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'service', 'version', 'timestamp', 'requestId'],
  properties: {
    status: { type: 'string', enum: ['ok', 'ready'] },
    service: { type: 'string' },
    version: { type: 'string' },
    timestamp: { type: 'string', format: 'date-time' },
    requestId: { type: 'string' },
  },
}

const apiErrorResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        requestId: { type: 'string' },
        details: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['path', 'message'],
            properties: {
              path: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
  },
}

const meResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['user'],
  properties: {
    user: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'isAnonymous'],
      properties: {
        id: { type: 'string' },
        isAnonymous: { type: 'boolean' },
      },
    },
  },
}

const unlockPlan = {
  type: 'object',
  additionalProperties: false,
  required: [
    'nextAction',
    'steps',
    'totalMinutes',
    'recommendedFocusMinutes',
    'energy',
    'supportiveMessage',
  ],
  properties: {
    nextAction: { type: 'string' },
    steps: {
      type: 'array',
      minItems: 2,
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['order', 'title', 'minutes'],
        properties: {
          order: { type: 'integer', minimum: 1 },
          title: { type: 'string' },
          minutes: { type: 'integer', minimum: 1 },
        },
      },
    },
    totalMinutes: { type: 'integer', minimum: 1 },
    recommendedFocusMinutes: { type: 'integer', minimum: 5, maximum: 60 },
    energy: { type: 'string', enum: ['low', 'medium', 'high'] },
    supportiveMessage: { type: 'string' },
  },
}

export const openApiComponents = {
  securitySchemes: {
    bearerAuth: {
      type: 'http' as const,
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Supabase access token. Send as `Authorization: Bearer <jwt>`.',
    },
  },
  schemas: {
    HealthResponse: healthResponse,
    ApiErrorResponse: apiErrorResponse,
    MeResponse: meResponse,
    UnlockPlan: unlockPlan,
    UnlockTaskRunRequest: {
      type: 'object',
      additionalProperties: false,
      required: [
        'clientRequestId',
        'task',
        'blockageReason',
        'blockageDetails',
        'availableMinutes',
        'currentEnergy',
        'today',
        'locale',
      ],
      properties: {
        clientRequestId: { type: 'string', format: 'uuid' },
        task: {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'title',
            'nextAction',
            'energy',
            'estimatedMinutes',
            'status',
          ],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            nextAction: { type: 'null' },
            energy: {
              anyOf: [
                { type: 'string', enum: ['low', 'medium', 'high'] },
                { type: 'null' },
              ],
            },
            estimatedMinutes: {
              anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }],
            },
            status: { type: 'string', enum: ['inbox', 'active'] },
          },
        },
        blockageReason: {
          type: 'string',
          enum: [
            'dont_know_where_to_start',
            'procrastinating',
            'low_energy',
            'overwhelmed',
            'other',
          ],
        },
        blockageDetails: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        availableMinutes: { type: 'integer', minimum: 5, maximum: 120 },
        currentEnergy: {
          anyOf: [
            { type: 'string', enum: ['low', 'medium', 'high'] },
            { type: 'null' },
          ],
        },
        today: {
          type: 'object',
          additionalProperties: false,
          required: ['date', 'role', 'plannedTaskCount'],
          properties: {
            date: { type: 'string', format: 'date' },
            role: {
              type: 'string',
              enum: ['essential', 'secondary', 'unplanned'],
            },
            plannedTaskCount: { type: 'integer', minimum: 0, maximum: 3 },
          },
        },
        locale: { type: 'string', enum: ['pt-BR', 'en-US'] },
      },
    },
    UnlockTaskRunResponse: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['runId', 'status', 'plan', 'promptVersion', 'createdAt'],
          properties: {
            runId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['completed'] },
            plan: unlockPlan,
            promptVersion: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: [
            'runId',
            'status',
            'question',
            'promptVersion',
            'createdAt',
          ],
          properties: {
            runId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['needs_clarification'] },
            question: { type: 'string' },
            promptVersion: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: [
            'runId',
            'status',
            'reason',
            'message',
            'promptVersion',
            'createdAt',
          ],
          properties: {
            runId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['rejected'] },
            reason: {
              type: 'string',
              enum: ['unsafe_input', 'unsupported_request'],
            },
            message: { type: 'string' },
            promptVersion: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      ],
    },
  },
}

export const healthResponseSchema = healthResponse
export const apiErrorResponseSchema = apiErrorResponse
export const meResponseSchema = meResponse
