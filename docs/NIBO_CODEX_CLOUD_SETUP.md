# NIBO Codex Cloud Setup

## Estado Atual

A fase piloto com video confirmou o caminho dos relatorios no NIBO e a estrutura dos XLS exportados. O sync real ja baixa os relatorios, valida os arquivos, gera identificadores externos por linha e importa pelo mesmo motor usado na importacao manual.

Implementado:

- motor compartilhado para a importacao manual;
- tabelas de configuracao projeto/empresa NIBO;
- controle separado de `paga` e `recebida`;
- logs por execucao e por item;
- entrypoint deterministico `npm run nibo:sync`;
- suporte a Playwright headed/headless;
- trava para nao importar arquivo NIBO sem identificador externo confirmado;
- exportacao direta de Contas Pagas e Contas Recebidas em XLS;
- upsert por `external_id` para atualizacao de lancamentos ja importados.

Ainda pendente:

- aplicar as migrations no Supabase remoto;
- testar `npm run nibo:sync` com uma sessao NIBO fresca;
- validar execucao Cloud antes de agendar;
- monitorar se o NIBO altera seletores, texto do menu ou estrutura do XLS.

## Arquitetura

Fluxo manual:

Usuario -> aba Importacao NIBO -> arquivo -> `parseArquivoNibo` -> `importarLinhasFinanceiras` -> Supabase.

Fluxo automatico esperado:

Codex Cloud agendado -> `npm run nibo:sync` -> Playwright -> NIBO -> exportacao -> parser/adaptador -> validacao -> importador compartilhado -> Supabase -> logs.

Arquivos principais:

- `src/lib/importacao/importer.ts`: motor compartilhado da importacao financeira.
- `src/lib/nibo.ts`: parser de arquivos exportados.
- `src/integrations/nibo/sync.ts`: orquestracao sequencial.
- `src/integrations/nibo/browser.ts`: abertura Playwright.
- `src/integrations/nibo/auth.ts`: autenticacao NIBO.
- `src/integrations/nibo/company.ts`: validacao do UUID na URL.
- `src/integrations/nibo/exports.ts`: fluxo deterministico de exportacao.
- `src/integrations/nibo/validator.ts`: validacoes antes de importar.
- `supabase/migrations/20260814120000_add_nibo_sync.sql`: schema da sincronizacao.
- `supabase/migrations/20260818134000_add_full_nibo_external_unique_index.sql`: indice usado pelo upsert por `external_id`.

## Banco de Dados

Novas tabelas:

- `nibo_project_configs`: vincula `empresa_id` ao `nibo_company_id`.
- `nibo_sync_runs`: resumo da execucao geral.
- `nibo_sync_items`: resultado por projeto e tipo (`paga` ou `recebida`).
- `nibo_sync_states`: ultimo estado independente de Pagas e Recebidas.

Colunas adicionadas:

- `importacoes.origem`, `periodo_inicio`, `periodo_fim`, `nibo_sync_run_id`.
- `lancamentos.origem`, `external_source`, `external_id`, `source_content_hash`, `updated_at`.

Indice de deduplicacao automatica:

- `lancamentos_external_source_id_idx` em `empresa_id`, `external_source`, `external_id`.
- `lancamentos_external_source_id_full_idx` nas mesmas colunas para permitir upsert via Supabase.

## Relatorios NIBO Mapeados

Empresa piloto observada:

- `AGAPE ESPACO DE ARTE LTDA`
- NIBO company id: `2857f666-3c72-43e8-8c29-31dbd3dc28fd`

Rotas:

- Contas recebidas: `https://empresa.nibo.com.br/Report/CreditEntries/{nibo_company_id}`
- Contas pagas: `https://empresa.nibo.com.br/Report/DebitEntries/{nibo_company_id}`

Query usada:

- `isAccrual=false`
- `startEntryDate=YYYY-MM-DD`
- `endEntryDate=YYYY-MM-DD`
- `costCenterFilterType=0`

Exportacao:

- abrir menu de download no topo do relatorio;
- escolher `Baixar em XLS`.

Identificadores:

- o XLS possui coluna `Id`;
- em Contas Recebidas o `Id` veio unico;
- em Contas Pagas o `Id` pode repetir quando ha rateio por centro de custo;
- por isso a automacao usa `nibo_company_id`, tipo, `Id`, categoria e centro de custo para montar o `external_id` por linha.

## Variaveis de Ambiente

Use `.env.example` como referencia. Nao versionar `.env`.

Supabase:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SYNC_EMAIL`
- `SUPABASE_SYNC_PASSWORD`

Opcional e sensivel:

- `NIBO_SUPABASE_USE_SERVICE_ROLE`
- `SUPABASE_SERVICE_ROLE_KEY`

NIBO/Playwright:

- `NIBO_BASE_URL`: use `https://www.nibo.com.br/log-in` por padrao. Se a conta exigir acesso direto pelo Passport, teste `https://passport.nibo.com.br/account/login`.
- `NIBO_HEADLESS`
- `NIBO_DRY_RUN`
- `NIBO_SYNC_LOOKBACK_DAYS`
- `NIBO_INITIAL_SYNC_MAX_DAYS`
- `NIBO_DOWNLOAD_DIR`
- `NIBO_STORAGE_STATE`
- `NIBO_SYNC_TRIGGER`

## Autenticacao NIBO

Primeira opcao para desenvolvimento local:

- autenticar manualmente;
- salvar `storageState` em caminho dentro de `.nibo-auth/`;
- nunca versionar esse arquivo.

Antes de Cloud:

- confirmar se o NIBO permite sessao headless sem CAPTCHA, 2FA obrigatorio ou confirmacao por dispositivo;
- se houver CAPTCHA, 2FA bloqueante ou protecao anti-bot, parar e revisar a estrategia;
- nao tentar burlar controles de seguranca.

## Supabase e Menor Privilegio

Recomendacao: criar um usuario tecnico Supabase para a rotina NIBO e vincula-lo aos projetos habilitados em `projeto_usuarios`. Assim a sincronizacao respeita RLS e nao precisa de service role.

Use service role somente com aprovacao explicita, porque ela bypassa RLS e aumenta o impacto de qualquer erro.

## Playwright e Chromium

Dependencias do projeto:

```bash
npm install
npx playwright install chromium --with-deps
```

Execucao local em modo visivel:

```bash
NIBO_HEADLESS=false npm run nibo:sync
```

Execucao headless:

```bash
NIBO_HEADLESS=true npm run nibo:sync
```

Dry run:

```bash
NIBO_DRY_RUN=true npm run nibo:sync
```

## Codex Cloud

O Cloud deve:

1. clonar o repositorio;
2. instalar dependencias com `npm install`;
3. instalar Chromium com `npx playwright install chromium --with-deps`;
4. receber secrets/variaveis de ambiente;
5. executar `npm run nibo:sync`;
6. encerrar.

Nao criar worker infinito, polling permanente ou servidor 24h.

## Internet

Dominios necessarios previstos:

- `www.nibo.com.br`;
- `passport.nibo.com.br`;
- `empresa.nibo.com.br`;
- dominios auxiliares carregados pelo proprio NIBO;
- `*.supabase.co` do projeto;
- `registry.npmjs.org` apenas durante instalacao de dependencias, se o ambiente nao tiver cache.

## Procedimento Antes de Agendar

1. Aplicar migrations no Supabase.
2. Criar usuario tecnico de sync.
3. Vincular usuario tecnico aos projetos piloto.
4. Configurar `nibo_project_configs` para um projeto piloto.
5. Rodar `NIBO_DRY_RUN=true npm run nibo:sync`.
6. Rodar `npm run nibo:auth`, fazer login/2FA e salvar `.nibo-auth/storageState.json`.
7. Rodar headed local com `NIBO_HEADLESS=false npm run nibo:sync`.
8. Rodar headless local com `NIBO_HEADLESS=true npm run nibo:sync`.
9. Rodar no Cloud manualmente.
10. Repetir execucoes e comparar logs.
11. Configurar agendamento semanal.

## Troubleshooting

- `NIBO_AUTH_REQUIRED`: sessao NIBO expirada; rode `npm run nibo:auth` novamente.
- `NIBO_EXPORT_MENU_NOT_FOUND`: o NIBO mudou o botao/menu de exportacao.
- `NIBO_COMPANY_MISMATCH`: UUID aberto no NIBO nao corresponde ao projeto.
- `NIBO_EXTERNAL_ID_MISSING`: arquivo exportado nao possui identificador unico confirmado.
- `NIBO_PARSE_ERROR`: estrutura do arquivo mudou ou nao corresponde ao esperado.
- Erro de RLS no Supabase: verificar se o usuario tecnico esta vinculado ao projeto.
