# @destravai/web

Aplicação Next.js do DestravAI. O planner e o timer continuam locais. O agente “Travei” só entra depois do login e nunca altera a tarefa sozinho.

## Variáveis

Públicas (navegador):

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Só no servidor (Route Handler do proxy):

```bash
DESTRAVAI_API_URL=http://localhost:3333
```

Não coloque `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY` nem service role neste app.

## Autenticação

V1 usa e-mail/senha e Google no Supabase.

1. Em Authentication → Email, habilite senha (não só magic link) e o template de confirmação.
2. Em Authentication → Google, configure Client ID e Secret do Google Cloud.
3. Site URL: origem da web (por exemplo `http://localhost:3000`).
4. Redirect URLs: `http://localhost:3000/auth/callback` e `http://localhost:3000/auth/callback?type=recovery`.
5. Em `/login` a pessoa entra, cria conta (nome, área, e-mail e senha) ou continua com Google. “Esqueci a senha” envia o e-mail de recuperação.
6. `/auth/callback` troca o código por sessão. O retorno é `/`, ou `/login?reset=1` quando `type=recovery`. Qualquer outro `next` é ignorado.

O planner funciona sem login. Sair da conta não apaga tarefas locais.

## Travei

1. Na Tela Hoje, use o botão global ou o de uma tarefa.
2. A web chama só `POST /api/agents/unlock-task/runs`.
3. O Route Handler valida o pedido, encaminha o JWT para `${DESTRAVAI_API_URL}/v1/agents/unlock-task/runs` e valida a resposta.
4. O plano é uma sugestão. “Usar este plano” atualiza `nextAction`, `energy` e `estimatedMinutes` (`totalMinutes`). Título, status e plano do dia não mudam.
5. “Começar foco” pede a mesma confirmação, usa a duração configurada do timer e não interrompe um ciclo ativo.

Se o assistente pedir um detalhe, a resposta abre um **novo** pedido. Não há continuação de run nesta V1.

Se `generationMode === 'fallback'`, a interface mostra só: “Plano rápido gerado enquanto o assistente estava indisponível.”

## Privacidade

A web não lê tabelas internas do agente, não chama RPCs e não usa o SDK da OpenAI. O service worker não cacheia `/api/agents/**`, `/auth/**`, `/login` nem POSTs.

## Testes

```bash
npm test --workspace @destravai/web
npm run lint --workspace @destravai/web
npm run build --workspace @destravai/web
```

Os testes comuns não chamam Supabase nem a API de verdade.

## Ainda não está em produção

O fluxo web depende da API, das migrations do agente e das variáveis públicas/servidor configuradas. Esta entrega não aplica migrations, não faz deploy, commit nem push.
