# @destravai/api

HTTP API do DestravAI: Fastify 5, TypeScript, contratos Zod e autenticação JWT do Supabase.

A V1 inclui o agente autenticado **Destravar tarefa**: recebe o contexto de uma tarefa bloqueada e devolve um microplano executável, uma pergunta de esclarecimento ou uma rejeição segura.

O plano é **apenas uma sugestão persistida**. Aplicá-lo à entidade `Task` fica a cargo da interface web em uma etapa posterior.

## Arquitetura do agente

```text
src/
├── app.ts
├── server.ts
├── agents/unlock-task/
│   ├── agent.ts          # Agent do SDK, modelo via config, output Zod
│   ├── instructions.ts   # prompt versionado unlock-v1
│   ├── context.ts        # estado confiável da execução (não controlado pelo modelo)
│   ├── runner.ts         # SDK + timeout + tracing
│   ├── service.ts        # orquestração: cota, segurança, fallback, persistência
│   ├── fallback.ts       # plano determinístico de 2 passos
│   ├── tools/            # get_task_context, validate_unlock_plan, save_unlock_plan
│   ├── guardrails/       # entrada (crise) e saída (protocolo, médico, contrato)
│   ├── repositories/     # interface + Supabase (segredo server-only) + memória (testes)
│   └── evals/            # casos offline e script opt-in
└── routes/agents/unlock-task.ts
```

Isso é um **agente**, não um chatbot: o modelo só conclui um plano depois de chamar ferramentas na ordem `get_task_context` → `validate_unlock_plan` → `save_unlock_plan`. Validação de tempo, passos e conteúdo médico é determinística. A identidade vem só do JWT, nunca do body ou do modelo.

O SDK usado é `@openai/agents` (Responses API). Não há Assistants API, LangChain, chave no navegador nem chamada direta da web para a OpenAI.

## Autenticação e autoridade

O navegador **não** persiste planos. Só chama:

```http
POST /v1/agents/unlock-task/runs
Authorization: Bearer <supabase-access-token>
```

A web usa apenas a chave **pública** (publishable). O JWT identifica o usuário. A API valida esse JWT via JWKS e deriva `userId` de `sub`.

As RPCs SQL (`start_unlock_agent_run`, `save_unlock_agent_plan`, `begin_unlock_fallback`, `finish_unlock_agent_run`) **não** são API pública. `anon`, `authenticated` e `PUBLIC` não têm `EXECUTE`. Só o papel do segredo hospedado (`service_role`) recebe `EXECUTE`. A migration não cria role customizada nem altera membership de papéis reservados.

Somente `apps/api` possui a credencial de persistência:

| Variável | Quem usa |
| --- | --- |
| `SUPABASE_PUBLISHABLE_KEY` | JWKS/issuer e identificação do projeto. Pode ser a chave pública. |
| `SUPABASE_SECRET_KEY` | Cliente server-only que executa as RPCs. **Nunca** no browser, **nunca** `NEXT_PUBLIC_*`, **nunca** no OpenAPI. |

Configure `SUPABASE_SECRET_KEY` com o segredo do painel (API → secret). Não use a chave publishable, nem prefixo `sb_publishable` / `sb_anon`. Não cole o valor em `.env.example`.

Rotação: gere um novo segredo no painel, atualize só o ambiente da API, reinicie o processo, revogue o anterior. O JWT do usuário **não** precisa mudar.

O repositório envia o `userId` já autenticado (`p_user_id`). Toda query continua filtrada por esse usuário. A credencial server-side não substitui o isolamento: um `userId` A não lê nem grava a run de B.

A cota e as transições de run/plano são mutadas só por essas funções `SECURITY DEFINER`. O JWT autenticado ainda pode `SELECT` as próprias linhas (RLS); não tem `INSERT`/`UPDATE`/`DELETE`.

O timeout cria um `AbortController`, passa `AbortSignal` ao SDK e arbitra no banco: `running` → save do agente **ou** `fallback_pending` → save do fallback. Lease expirada em `fallback_pending` **permanece** `fallback_pending`. Não há dois planos por run. Plano já persistido devolve o `generationMode` gravado (`persisted_plan_won`), nunca um rótulo de agente para um plano fallback.

As migrations precisam ser aplicadas e conferidas no catálogo real do Supabase. Os testes comuns leem o SQL; não substituem `supabase db push` / inspeção de grants.

## Fluxo de execução

1. Autentica o Bearer JWT do Supabase.
2. Valida o body com `UnlockTaskRunRequestSchema`.
3. Inspeciona o texto com guardrail de entrada (crise / autoagressão). Falha de moderação → `503` (não libera a execução).
4. Reserva a cota diária e cria `agent_run` de forma atômica (RPC no Postgres; mutex na memória de teste).
5. Idempotência por `(user_id, clientRequestId)`.
6. Executa o agente (timeout com `AbortSignal`, no máximo 8 turnos, `parallelToolCalls: false`).
7. Valida o protocolo e persiste o resultado. Timeout e provedor recuperável passam pela arbitragem atômica no repositório.
8. Resposta discriminada: `completed` | `needs_clarification` | `rejected`. A resposta `completed` é confirmada com o plano persistido.

## Ferramentas

| Ferramenta | Papel |
| --- | --- |
| `get_task_context` | Lê o contexto confiável da execução. Parâmetros vazios. Não deixa o modelo escolher outra tarefa. Não devolve usuário, e-mail ou token. |
| `validate_unlock_plan` | Valida 2–4 passos, ordem, minutos, soma, tempo disponível, primeiro passo concreto e ausência de conteúdo médico. Grava um hash canônico. |
| `save_unlock_plan` | Exige contexto lido + hash válido. Recalcula o hash. Persiste a sugestão sem alterar `Task`. |

## Variáveis de ambiente

Copie `.env.example` para `.env`. `process.env` só é lido em `loadConfig` (e no bootstrap `server.ts`).

| Variável | Notas |
| --- | --- |
| `OPENAI_API_KEY` | Obrigatória em produção. Passada ao SDK via config, não pelo browser. |
| `OPENAI_MODEL` | Obrigatória fora de testes. Nenhum nome de modelo fica hardcoded. |
| `OPENAI_AGENT_PROMPT_VERSION` | Padrão `unlock-v1`. |
| `OPENAI_AGENT_TRACING_ENABLED` | Tracing do workflow `destravai.unlock-task.v1`. **Desligado** por padrão. Em produção só liga com `true` explícito. |
| `OPENAI_TRACE_INCLUDE_SENSITIVE_DATA` | Deve permanecer `false`. Produção recusa `true`. |
| `AGENT_TIMEOUT_MS` | Padrão `20000`. |
| `AGENT_MAX_TURNS` | Padrão `8`. |
| `AGENT_DAILY_LIMIT` | Usado pelo repositório em memória e como documentação do padrão. Em Supabase o limite vem de `agent_quota_settings.daily_limit` (inicial 5). |
| `AGENT_LEASE_MS` | Duração da lease de uma run `running`/`fallback_pending` (padrão 90s). Depois da expiração a mesma `clientRequestId` pode ser recuperada sem nova cota. |
| `AGENT_REPOSITORY` | `supabase` em produção. `memory` só em testes ou desenvolvimento explícito. |
| `SUPABASE_URL` | Projeto Supabase. Obrigatória em produção. |
| `SUPABASE_PUBLISHABLE_KEY` | Chave pública do projeto. Não autoriza as RPCs internas. |
| `SUPABASE_SECRET_KEY` | Segredo server-only da API. Obrigatória quando `AGENT_REPOSITORY=supabase`. Sem default. Sem prefixo público. |
| `RUN_LIVE_AGENT_TESTS` | `false` nos testes comuns. Live eval só com `true`. |

Produção exige `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY`. Não coloque o segredo em `apps/web` nem em variáveis `NEXT_PUBLIC_*`. O JWT do usuário autentica o request HTTP; o repositório abre um cliente server-only e passa `p_user_id`.

Zod: `@destravai/api` e `@destravai/contracts` devem resolver **Zod 3.25.76** (`errorMap`). O Serwist da web pode continuar em Zod 4. Sempre rode `npm ci` **na raiz** do monorepo; não rode `npm ci` dentro de `apps/api`. A duplicidade de majors não está unificada no lockfile inteiro.

## Segurança e privacidade

- Crise, autoagressão ou risco imediato **não** são tratados como bloqueio de produtividade. A rota devolve `status: 'rejected'`, `reason: 'safety'`, mensagem localizada, sem aconselhamento clínico. O texto sensível bruto não é persistido.
- Saída médica, diagnóstico, prescrição ou alegação terapêutica é rejeitada.
- Logs correlacionam `requestId`, `runId`, status, latência, modo de geração e código de erro sanitizado. Não registram Authorization, body, título da tarefa, prompt ou payload bruto de ferramenta.
- `agent_runs` guarda metadados (status, motivo categórico, versão de prompt, modelo, tokens, latência, payload da **resposta** para replay). Não guarda header Authorization, JWT, e-mail, prompt completo, body bruto nem título bruto da tarefa.
- Tracing desligado por padrão. Só liga com `OPENAI_AGENT_TRACING_ENABLED=true`. Dados sensíveis (inputs/outputs de tools) permanecem desligados; produção recusa `OPENAI_TRACE_INCLUDE_SENSITIVE_DATA=true`. Metadata do trace, se opt-in: `runId` e `promptVersion`.

## Idempotência

Mesma combinação de usuário e `clientRequestId`:

- Execução terminal (`completed`, `needs_clarification`, `rejected`) devolve a resposta persistida.
- Execução `running` / `pending` / `fallback_pending` com lease válida devolve `409 CONFLICT`.
- Lease expirada permite recuperar a mesma run **sem** consumir cota extra (um worker por vez).
- Corridas concorrentes não criam duas execuções nem dois planos (unique `(user_id, client_request_id)` + lock da cota).
- `failed` pode ser re tentada **sem** consumir cota extra.

A idempotência não é só em memória: no Postgres ela vive na constraint e na RPC `start_unlock_agent_run` (`SECURITY DEFINER`, `p_user_id` da API).

## Cotas

O limite diário em produção está em `public.agent_quota_settings` (uma linha, `daily_limit` inicial 5, faixa 1–100). `authenticated` não lê nem escreve essa tabela. Um operador altera com sessão privilegiada:

```sql
UPDATE public.agent_quota_settings
SET daily_limit = 8, updated_at = now()
WHERE id = 1;
```

A reserva é atômica (`SELECT … FOR UPDATE` na linha de `agent_daily_usage` + incremento na mesma transação). O cliente **não** informa o limite. Exceder a cota devolve `429` com `code: AGENT_QUOTA_EXCEEDED` (distinto do rate limit por IP).

O dia da cota é o **dia civil UTC** (`timezone('utc', now())::date`). Documente isso para o produto: a virada não segue o fuso do usuário.

Há também rate limit por IP no prefixo `/v1/agents/*`, separado da cota diária.

## Erros HTTP

Envelope `ApiErrorResponse`:

| Status | Code |
| --- | --- |
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHORIZED` |
| 409 | `CONFLICT` |
| 429 | `AGENT_QUOTA_EXCEEDED` ou `RATE_LIMITED` |
| 502 | `BAD_GATEWAY` (protocolo/resposta inválida) ou `AGENT_MAX_TURNS_EXCEEDED` (estouro de turnos, **sem** fallback) |
| 503 | `SERVICE_UNAVAILABLE` |
| 504 | `GATEWAY_TIMEOUT` (timeout com arbitragem vencida, mas fallback não persistiu) |

Classificação de fallback: permitido só após timeout efetivamente cancelado e arbitrado, ou erro transitório do provedor **antes** de persistir um plano. Sem fallback para `MaxTurnsExceeded`, protocolo, resultado inválido, safety, auth, contrato, banco, plano já salvo ou estado incompatível.

Sem stack, prompt, resposta bruta da OpenAI ou detalhe interno do Supabase.

## Fallback

Usado só no eixo timeout/provedor recuperável. O timeout tenta `running → fallback_pending` só se ainda não houver plano. Gera 2 passos válidos, persiste com `generationMode: 'fallback'` e devolve o plano **lido do repositório**. Não substitui plano do agente nem mascara rejeição de segurança, auth, contrato ou falha de banco.

## Como executar testes

Na raiz:

```bash
npm test -w @destravai/api
npm run lint:api
npm run build:api
```

Os testes comuns **não** chamam a OpenAI. Runner, moderador, relógio e repositório são injetáveis. `NODE_ENV=test` recusa o SDK real se o runner não for injetado.

## Avaliações offline

```bash
npm run eval:agent --workspace @destravai/api
```

Gera JSON em `.eval-results/` (ignorado pelo Git). Não acessa a rede.

## Avaliação ao vivo (opt-in, paga)

Não rode isso no CI. Só com chave real:

```bash
# em apps/api/.env (não commitado)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=...
RUN_LIVE_AGENT_TESTS=true

npm run eval:agent --workspace @destravai/api
```

Isso chama a OpenAI de verdade. Sem `RUN_LIVE_AGENT_TESTS=true` o script permanece offline.

## Exemplo de curl

```bash
curl -sS http://localhost:3333/v1/agents/unlock-task/runs \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientRequestId": "550e8400-e29b-41d4-a716-446655440000",
    "task": {
      "id": "task_123",
      "title": "Preparar apresentacao",
      "nextAction": null,
      "estimatedMinutes": 60,
      "energy": "medium",
      "status": "active"
    },
    "blockageReason": "dont_know_where_to_start",
    "blockageDetails": null,
    "availableMinutes": 20,
    "currentEnergy": "medium",
    "today": { "date": "2026-08-28", "role": "essential", "plannedTaskCount": 1 },
    "locale": "pt-BR"
  }'
```

## Limitações da V1

- Sem UI web, dialog ou botão “Travei”.
- O plano **não** é aplicado à tarefa.
- Sem chat contínuo, memória longa, multiagentes, voz ou Alexa.
- Sem migração de tarefas do `localStorage`.
- Repositório em memória não serve produção.
- Rate limit por IP é in-memory (uma instância).
- Lease expirada: `running` continua `running`; `fallback_pending` continua `fallback_pending`; terminal não reabre. Sem cota extra.
- RLS e grants corretivos precisam ser validados num projeto Supabase real (os testes comuns cobrem SQL + memória). Checklist: aplicar a sequência de migrations; `authenticated`/`anon`/`PUBLIC` sem `EXECUTE` nas RPCs; só `service_role` com execute; helpers sem execute público; `fallback_pending` não volta a `running`.

## Comandos

```bash
npm run dev:api
npm run test:api
npm run lint:api
npm run build:api
npm run start --workspace @destravai/api
```

Node.js `>=20.9`.
