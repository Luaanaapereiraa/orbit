# Orbit

Timer de ciclos de foco para qualquer área de tech: produto, design, dados, engenharia, QA e mais.

Pausas, tarefas, estatísticas e tema claro/escuro. Feito com React, TypeScript, Next.js (App Router) e Tailwind CSS. Pode ser instalado como app (PWA) e funciona offline depois do primeiro acesso.

Este repositório é um monorepo com npm workspaces. A interface atual continua sendo o Orbit; o domínio compartilhado antecipa a evolução para o DestravAI.

## Estrutura

```text
/
├── apps/
│   ├── web/              # aplicação Next.js (App Router)
│   └── api/              # API Fastify (@destravai/api)
├── packages/
│   ├── core/             # regras de negócio compartilháveis
│   └── contracts/        # schemas Zod / tipos HTTP (@destravai/contracts)
├── supabase/
│   ├── config.toml       # placeholder local, sem secrets
│   └── migrations/       # SQL versionado (ainda não aplicado)
├── package.json          # workspaces e scripts da raiz
├── package-lock.json     # único lockfile
└── tsconfig.base.json    # TypeScript compartilhado
```

### Rotas (`apps/web`)

| URL | Tela |
| --- | --- |
| `/` | Timer |
| `/history` | Histórico |
| `/stats` | Estatísticas |
| `/settings` | Configurações |

As rotas ficam no App Router (`src/app/(product)/`). O grupo `(product)` não altera as URLs. Os arquivos `page.tsx` só montam componentes de `src/features/`, que podem ser testados sem o runtime do Next.

### `apps/web` (`@destravai/web`)

Aplicação web: interface, App Router, persistência em `localStorage`, tema, sons, notificações do navegador, PWA e o `PomodoroContext` (React). Consome o domínio via `@destravai/core`.

Client Components são usados só onde há hooks, contexto, eventos, `usePathname` ou APIs do navegador. O root layout, metadata e o layout estrutural das rotas permanecem Server Components.

O estado do Pomodoro hidrata de forma segura: o primeiro render (servidor e cliente) usa o estado inicial; o `localStorage` só é lido após o mount; nada é persistido até essa leitura terminar. A chave `@pomodorodev:cycles-state-2.0.0` e a migração da v1 são preservadas. A classe `dark` é aplicada por um script inline no `html` para evitar flash de tema.

A PWA usa o Web App Manifest do App Router e Serwist (`@serwist/turbopack`) para precache e cache de rotas/assets já visitados. O service worker não é registrado em desenvolvimento nem nos testes.

### `apps/api` (`@destravai/api`)

API Node.js (Fastify 5). Sobe à parte da web. Endpoints atuais: `GET /health`, `GET /ready` (públicos) e `GET /v1/me` (JWT Supabase). Não há endpoint de IA nesta entrega.

Node.js `>=20.9`. Copie `apps/api/.env.example` para `apps/api/.env` (ou um `.env` na raiz ao rodar o processo). Arquivos `.env` não entram no git.

```bash
npm run dev:api
```

- Health: `GET http://localhost:3333/health`
- Ready: `GET http://localhost:3333/ready`
- Auth: `Authorization: Bearer <access token do Supabase>`. A API verifica a assinatura via JWKS (não só decodifica).
- Rate limit: por IP em memória, adequado a **uma instância**. `/health` e `/ready` ficam fora da cota do agente. Réplicas precisam de store compartilhado. Cota diária por usuário ainda não existe.
- Docs: Swagger UI só com `ENABLE_API_DOCS=true`.

Detalhes em `apps/api/README.md`.

### `packages/core` (`@destravai/core`)

Lógica pura, independente de plataforma: tipos, reducer, actions (incluindo hidratação do estado), cálculos de tempo, estatísticas e regras de pausas/ciclos. Sem React, Next, DOM, `localStorage` ou APIs de navegador.

### `packages/contracts` (`@destravai/contracts`)

Schemas Zod e tipos inferidos para HTTP (pedido/resposta do futuro Unlock Task Run, erros, health). Sem React, Fastify, DOM ou banco. Consumo: `import { ... } from '@destravai/contracts'`.

### `supabase/`

Migrations locais de `agent_runs` e `unlock_plans` com RLS. Não são aplicadas neste passo. Validar depois com a CLI do Supabase (`supabase db lint` / ambiente local). `agent_runs` não guarda título da tarefa nem texto de bloqueio; `unlock_plans` guarda o plano gerado.

## Requisitos

- Node.js 20.9+ (a API exige; o workspace web também roda nessa faixa)
- npm (workspaces). Não use pnpm, Yarn ou Bun neste repositório.

Instale as dependências **na raiz**. Há um único `package-lock.json`.

```bash
npm install
```

## Scripts (raiz)

```bash
npm run dev:web   # Next.js em apps/web
npm run dev       # alias de dev:web
npm run dev:api   # Fastify em apps/api
npm test          # core + contracts + web + api
npm run lint      # core + contracts + web + api
npm run build     # typecheck core/contracts, build web, build api
npm run test:api
npm run lint:api
npm run build:api
```

Produção local, depois do build:

```bash
npm run start -w @destravai/web
npm run start --workspace @destravai/api
```

## Como usar

1. Crie e selecione uma tarefa
2. Comece o ciclo de foco (a duração vem das configurações)
3. Pause, retome ou interrompa quando precisar
4. Ao terminar, a pausa curta ou longa inicia sozinha (se estiver ativado)
5. Acompanhe o histórico e as estatísticas

Os dados da web ficam salvos no navegador (`localStorage`).

## Fora desta entrega

Não há rota de execução de agente/IA, cota diária por usuário, persistência ligada à API, aplicativo mobile (Expo), Server Actions de negócio, Alexa nem a marca DestravAI na interface. Migrations do Supabase existem só como arquivos locais.
