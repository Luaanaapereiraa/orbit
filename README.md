# Orbit

Timer de ciclos de foco para qualquer área de tech: produto, design, dados, engenharia, QA e mais.

Pausas, tarefas, estatísticas e tema claro/escuro. Feito com React, TypeScript, Next.js (App Router) e Tailwind CSS. Pode ser instalado como app (PWA) e funciona offline depois do primeiro acesso.

Este repositório é um monorepo com npm workspaces. A interface atual continua sendo o Orbit; o domínio compartilhado antecipa a evolução para o DestravAI.

## Estrutura

```text
/
├── apps/
│   └── web/              # aplicação Next.js (App Router)
├── packages/
│   └── core/             # regras de negócio compartilháveis
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

### `packages/core` (`@destravai/core`)

Lógica pura, independente de plataforma: tipos, reducer, actions (incluindo hidratação do estado), cálculos de tempo, estatísticas e regras de pausas/ciclos. Sem React, Next, DOM, `localStorage` ou APIs de navegador.

## Requisitos

- Node.js 18+
- npm (workspaces). Não use pnpm, Yarn ou Bun neste repositório.

Instale as dependências **na raiz**. Há um único `package-lock.json`.

```bash
npm install
```

## Scripts (raiz)

```bash
npm run dev:web   # Next.js em apps/web
npm run dev       # alias de dev:web
npm test          # testes do core e do web
npm run lint      # lint do core e do web
npm run build     # typecheck do core e build do web
```

Produção local, depois do build:

```bash
npm run start -w @destravai/web
```

## Como usar

1. Crie e selecione uma tarefa
2. Comece o ciclo de foco (a duração vem das configurações)
3. Pause, retome ou interrompa quando precisar
4. Ao terminar, a pausa curta ou longa inicia sozinha (se estiver ativado)
5. Acompanhe o histórico e as estatísticas

Os dados ficam salvos no navegador (`localStorage`).

## Fora desta entrega

Aplicativo mobile (Expo), API Node, Supabase, autenticação, Server Actions de negócio, IA, Alexa e a marca DestravAI na interface ainda não fazem parte deste repositório.
