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
│   ├── repositories/     # interface + Supabase (JWT) + memória (testes)
│   └── evals/            # casos offline e script opt-in
└── routes/agents/unlock-task.ts
```

Isso é um **agente**, não um chatbot: o modelo só conclui um plano depois de chamar ferramentas na ordem `get_task_context` → `validate_unlock_plan` → `save_unlock_plan`. Validação de tempo, passos e conteúdo médico é determinística. A identidade vem só do JWT, nunca do body ou do modelo.

O SDK usado é `@openai/agents` (Responses API). Não há Assistants API, LangChain, chave no navegador nem chamada direta da web para a OpenAI.

## Fluxo de execução

1. Autentica o Bearer JWT do Supabase.
2. Valida o body com `UnlockTaskRunRequestSchema`.
3. Inspeciona o texto com guardrail de entrada (crise / autoagressão). Falha de moderação → `503` (não libera a execução).
4. Reserva a cota diária e cria `agent_run` de forma atômica (RPC no Postgres; mutex na memória de teste).
5. Idempotência por `(user_id, clientRequestId)`.
6. Executa o agente (timeout externo, no máximo 8 turnos, concorrência de ferramentas = 1).
7. Valida o protocolo e persiste o resultado.
8. Resposta discriminada: `completed` | `needs_clarification` | `rejected`.

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
| `OPENAI_AGENT_TRACING_ENABLED` | Tracing do workflow `destravai.unlock-task.v1`. |
| `OPENAI_TRACE_INCLUDE_SENSITIVE_DATA` | Deve ser `false` em produção. |
| `AGENT_TIMEOUT_MS` | Padrão `20000`. |
| `AGENT_MAX_TURNS` | Padrão `8`. |
| `AGENT_DAILY_LIMIT` | Padrão `5` reservas por usuário por **dia civil UTC**. |
| `AGENT_REPOSITORY` | `supabase` em produção. `memory` só em testes ou desenvolvimento explícito. |
| `RUN_LIVE_AGENT_TESTS` | `false` nos testes comuns. Live eval só com `true`. |

Produção também exige `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`. Não use `service_role` nas requisições do usuário. O repositório abre um cliente Supabase com o JWT do caller e respeita RLS.

## Segurança e privacidade

- Crise, autoagressão ou risco imediato **não** são tratados como bloqueio de produtividade. A rota devolve `status: 'rejected'`, `reason: 'safety'`, mensagem localizada, sem aconselhamento clínico. O texto sensível bruto não é persistido.
- Saída médica, diagnóstico, prescrição ou alegação terapêutica é rejeitada.
- Logs correlacionam `requestId`, `runId`, status, latência, modo de geração e código de erro sanitizado. Não registram Authorization, body, título da tarefa, prompt ou payload bruto de ferramenta.
- `agent_runs` guarda metadados (status, motivo categórico, versão de prompt, modelo, tokens, latência, payload da **resposta** para replay). Não guarda header Authorization, JWT, e-mail, prompt completo, body bruto nem título bruto da tarefa.
- Tracing sem dados sensíveis. Metadata do trace: `runId` e `promptVersion`.

## Idempotência

Mesma combinação de usuário e `clientRequestId`:

- Execução terminal (`completed`, `needs_clarification`, `rejected`) devolve a resposta persistida.
- Execução `running` / `pending` devolve `409 CONFLICT`.
- Corridas concorrentes não criam duas execuções nem dois planos (unique `(user_id, client_request_id)` + lock da cota).
- `failed` pode ser re tentada **sem** consumir cota extra.

A idempotência não é só em memória: no Postgres ela vive na constraint e na RPC `start_unlock_agent_run`.

## Cotas

Limite diário por usuário (`AGENT_DAILY_LIMIT`). A reserva é atômica (`SELECT … FOR UPDATE` na linha de `agent_daily_usage` + incremento na mesma transação). Exceder a cota devolve `429` com `code: AGENT_QUOTA_EXCEEDED` (distinto do rate limit por IP).

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
| 502 | `BAD_GATEWAY` (protocolo/resposta inválida do provedor) |
| 503 | `SERVICE_UNAVAILABLE` |
| 504 | `GATEWAY_TIMEOUT` (timeout sem fallback persistível) |

Sem stack, prompt, resposta bruta da OpenAI ou detalhe interno do Supabase.

## Fallback

Usado só para timeout, indisponibilidade transitória ou erro técnico recuperável do modelo. Gera 2 passos válidos, respeita tempo/energia, persiste normalmente e devolve `generationMode: 'fallback'`. Não contorna rejeição de segurança nem mascara auth, contrato ou falha de banco.

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

- Sem UI web, dialog ou botão “Estou travada”.
- O plano **não** é aplicado à tarefa.
- Sem chat contínuo, memória longa, multiagentes, voz ou Alexa.
- Sem migração de tarefas do `localStorage`.
- Repositório em memória não serve produção.
- Rate limit por IP é in-memory (uma instância).
- Execução `running` abandonada (crash) continua `409` até intervenção; `failed` pode ser re tentada.
- Cota no dia UTC, não no fuso local do usuário.

## Comandos

```bash
npm run dev:api
npm run test:api
npm run lint:api
npm run build:api
npm run start --workspace @destravai/api
```

Node.js `>=20.9`.
