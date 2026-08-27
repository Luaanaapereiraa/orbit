# Orbit

Timer de ciclos de foco para qualquer área de tech: produto, design, dados, engenharia, QA e mais.

Pausas, tarefas, estatísticas e tema claro/escuro. Feito com React, TypeScript, Vite e Tailwind CSS. Pode ser instalado como app (PWA) e funciona offline depois do primeiro acesso.

Este repositório é um monorepo com npm workspaces. A interface atual continua sendo o Orbit; a extração do domínio compartilhado antecipa a evolução para o DestravAI.

## Estrutura

```text
/
├── apps/
│   └── web/              # aplicação Vite (React)
├── packages/
│   └── core/             # regras de negócio compartilháveis
├── package.json          # workspaces e scripts da raiz
├── package-lock.json     # único lockfile
└── tsconfig.base.json    # TypeScript compartilhado
```

### `apps/web` (`@destravai/web`)

Aplicação web: interface, roteamento, persistência em `localStorage`, tema, sons, notificações do navegador, PWA e o `PomodoroContext` (React). Consome o domínio via `@destravai/core`.

### `packages/core` (`@destravai/core`)

Lógica pura, independente de plataforma: tipos (`Task`, `Cycle`, `Settings`, `PomodoroState`), reducer, actions, cálculos de tempo, estatísticas e regras de pausas/ciclos. Sem React, DOM, `localStorage` ou APIs de navegador.

## Requisitos

- Node.js 18+
- npm (workspaces). Não use pnpm, Yarn ou Bun neste repositório.

Instale as dependências **na raiz**. Há um único `package-lock.json`.

```bash
npm install
```

## Scripts (raiz)

```bash
npm run dev:web   # sobe o Vite em apps/web
npm run dev       # alias de dev:web
npm test          # testes do core e do web
npm run lint      # lint do core e do web
npm run build     # typecheck do core e build do web
```

## Como usar

1. Crie e selecione uma tarefa
2. Comece o ciclo de foco (a duração vem das configurações)
3. Pause, retome ou interrompa quando precisar
4. Ao terminar, a pausa curta ou longa inicia sozinha (se estiver ativado)
5. Acompanhe o histórico e as estatísticas

Os dados ficam salvos no navegador (`localStorage`).

## Fora desta entrega

Aplicativo mobile (Expo), API Node, Supabase, autenticação e a marca DestravAI na interface ainda não fazem parte deste repositório.
