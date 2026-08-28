# @destravai/api

HTTP API do DestravAI: Fastify 5, TypeScript, contratos Zod e autenticação JWT do Supabase.

Esta etapa **não executa agente de IA**. Não há rota `/v1/agents/*` de geração de plano. Os schemas de `UnlockTaskRun` existem nos contratos e no OpenAPI para o próximo passo.

## Arquitetura

```text
src/
├── app.ts              # buildApp() — sem listen, testável com inject
├── server.ts           # startServer() — env, listen, shutdown
├── config/             # Zod único; testes injetam AppConfig
├── plugins/            # CORS, helmet, rate-limit, OpenAPI, erros, logger
├── routes/             # /health, /ready, /v1/me
├── auth/               # Bearer + jose (JWKS ou verifier injetado)
├── errors/
└── test/
```

`buildApp(options)` recebe `config` e, nos testes, um `jwtVerifier` local. Produção usa JWKS remoto do Supabase (`/auth/v1/.well-known/jwks.json`), com cache do `jose`. Não há `service_role`, JWT secret legado nem chave privada no servidor.

O `tsconfig` da API usa `moduleResolution: bundler` (os contratos exportam TypeScript, como o core). O runtime é Node.js ESM: `dev` via `tsx`, `build` gera `dist/server.js` com esbuild (`target: node20`).

## Comandos

Na raiz do monorepo:

```bash
npm run dev:api
npm run test:api
npm run lint:api
npm run build:api
npm run start --workspace @destravai/api
```

Node.js `>=20.9`. Copie `.env.example` para `.env` local (o `.env` não entra no git).

## Contratos

Consumo apenas de `@destravai/contracts`. A API não importa internals de `@destravai/core`.

Validação Zod de `UnlockTaskRunRequest` está pronta para a rota futura. O endpoint de execução **não está implementado**.

## Segurança

- CORS por allowlist. Nunca `*`.
- Helmet (CSP relaxado só com docs).
- Body limitado (16 KiB).
- Logger estruturado; `authorization`, cookies e chaves de header são redacted. Body, `blockageDetails` e tokens não são logados.
- Erros no contrato `ApiErrorResponse` (`code`, `message`, `requestId`, `details` opcional). Sem stack na resposta. Em produção o log de 500 traz code, requestId e userId, sem stack.
- `/health` e `/ready` não expõem env, host, chaves nem stack.

## Auth

`GET /v1/me` exige `Authorization: Bearer <access token>`. O plugin verifica assinatura (JWKS), issuer, audience, `exp` e `sub`. Claim `is_anonymous` (quando existir) vira `user.isAnonymous`.

Identidade não é lida do body.

## Rate limit

- Cota global conservadora por IP (memória, uma instância).
- Prefixo `/v1/agents/*` já usa cota mais baixa, para quando a rota do agente existir.
- `/health` e `/ready` ficam fora da cota do agente (e não consomem o limiter).
- 429 no contrato `ApiErrorResponse`, com headers `x-ratelimit-*` quando o plugin os envia.

Réplicas precisam de store compartilhado (Redis ou equivalente). A memória **não** é solução distribuída. Cota diária por usuário virá com Supabase na etapa do agente.

## OpenAPI

Em desenvolvimento o spec é registrado. Swagger UI (`/documentation`) só existe se `ENABLE_API_DOCS=true`. Em produção a UI não sobe sem esse flag.

Schemas do agente aparecem como componentes, sem rota de execução.

## O que persiste (Supabase, próximo uso)

As migrations em `supabase/migrations/` ainda não são aplicadas daqui.

- `agent_runs`: metadados da execução (status, motivo categórico, versão de prompt, tokens, latência). **Não** guarda título da tarefa nem texto de bloqueio.
- `unlock_plans`: o plano gerado (funcionalidade). RLS: `authenticated` só vê/grava `user_id = auth.uid()`. Sem delete e sem política pública.

## Próximo passo

Rota autenticada de `UnlockTaskRun`, persistência em `agent_runs` / `unlock_plans`, cota diária por usuário e tracing do modelo. Sem OpenAI / Agents SDK nesta camada até o prompt correspondente.
