-- Consolidated baseline for PostgreSQL 17.
-- This migration is intended for a new empty PostgreSQL database.
-- Authorization policies that depended on external JWT/session helpers were
-- intentionally removed; access control must be enforced by the future API.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.app_role AS ENUM ('admin', 'consultor', 'cliente');
CREATE TYPE public.grupo_dre AS ENUM (
  'receita_operacional',
  'deducoes',
  'custos',
  'despesas',
  'financeiro',
  'nao_operacional'
);
CREATE TYPE public.tipo_lancamento AS ENUM ('recebida', 'paga');
CREATE TYPE public.tratamento_lancamento AS ENUM (
  'operacional',
  'transferencia',
  'emprestimo',
  'aporte',
  'resgate',
  'aplicacao',
  'investimento',
  'compra_ativo',
  'reembolso',
  'estorno',
  'juros',
  'multa',
  'tarifa',
  'receita_financeira'
);
CREATE TYPE public.classificacao_custo AS ENUM ('fixo', 'variavel');
CREATE TYPE public.status_acao AS ENUM (
  'pendente',
  'em_andamento',
  'aguardando_cliente',
  'atrasado',
  'concluido',
  'cancelado'
);
CREATE TYPE public.status_checklist_fluxo AS ENUM (
  'nao_selecionado',
  'selecionado_pagamento',
  'identificado_pago'
);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  nome text NOT NULL DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER users_updated
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

CREATE TABLE public.empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnpj text,
  cor_primaria text NOT NULL DEFAULT '#0B2545',
  logo_url text,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER empresas_updated
BEFORE UPDATE ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  grupo public.grupo_dre NOT NULL,
  nome text NOT NULL,
  classificacao public.classificacao_custo NOT NULL DEFAULT 'variavel',
  recorrente boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, grupo, nome)
);

CREATE TABLE public.mapeamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  categoria_nibo text NOT NULL,
  categoria_id uuid REFERENCES public.categorias(id) ON DELETE SET NULL,
  tratamento public.tratamento_lancamento NOT NULL DEFAULT 'operacional',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, categoria_nibo)
);

CREATE TABLE public.nibo_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_source text NOT NULL DEFAULT 'manual' CHECK (trigger_source IN ('manual', 'scheduled', 'test')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial_success', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  projects_total integer NOT NULL DEFAULT 0,
  projects_success integer NOT NULL DEFAULT 0,
  projects_failed integer NOT NULL DEFAULT 0,
  pagas_success integer NOT NULL DEFAULT 0,
  pagas_failed integer NOT NULL DEFAULT 0,
  recebidas_success integer NOT NULL DEFAULT 0,
  recebidas_failed integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE TABLE public.importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo public.tipo_lancamento NOT NULL,
  competencia date NOT NULL,
  arquivo_nome text NOT NULL,
  arquivo_path text,
  total_registros integer NOT NULL DEFAULT 0,
  duplicados integer NOT NULL DEFAULT 0,
  valor_total numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'confirmada',
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'nibo_auto')),
  periodo_inicio date,
  periodo_fim date,
  nibo_sync_run_id uuid REFERENCES public.nibo_sync_runs(id) ON DELETE SET NULL
);

CREATE TABLE public.lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  importacao_id uuid REFERENCES public.importacoes(id) ON DELETE CASCADE,
  tipo public.tipo_lancamento NOT NULL,
  data_efetiva date NOT NULL,
  competencia date NOT NULL,
  descricao text NOT NULL DEFAULT '',
  categoria_nibo text,
  categoria_id uuid REFERENCES public.categorias(id) ON DELETE SET NULL,
  pessoa text,
  centro_custo text,
  conta_bancaria text,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  tratamento public.tratamento_lancamento NOT NULL DEFAULT 'operacional',
  nao_recorrente boolean NOT NULL DEFAULT false,
  hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'nibo_auto')),
  external_source text,
  external_id text,
  source_content_hash text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, hash)
);

CREATE INDEX lancamentos_empresa_comp_idx
ON public.lancamentos (empresa_id, competencia);

CREATE UNIQUE INDEX lancamentos_external_source_id_idx
ON public.lancamentos (empresa_id, external_source, external_id)
WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

CREATE UNIQUE INDEX lancamentos_external_source_id_full_idx
ON public.lancamentos (empresa_id, external_source, external_id);

CREATE TRIGGER lancamentos_updated
BEFORE UPDATE ON public.lancamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.metas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  tipo text NOT NULL,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, competencia, tipo)
);

CREATE TABLE public.planos_acao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  categoria text,
  problema text NOT NULL,
  acao text NOT NULL,
  responsavel text,
  prazo date,
  prioridade text NOT NULL DEFAULT 'media',
  status public.status_acao NOT NULL DEFAULT 'pendente',
  resultado_esperado text,
  comentarios text,
  evidencias text,
  concluido_em date,
  competencia_origem date,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  relatorio_gerado_em timestamptz
);

CREATE INDEX planos_acao_relatorio_gerado_em_idx
ON public.planos_acao (empresa_id, relatorio_gerado_em);

CREATE TRIGGER planos_acao_updated
BEFORE UPDATE ON public.planos_acao
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.periodos_fechados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  fechado boolean NOT NULL DEFAULT true,
  fechado_por uuid REFERENCES public.users(id) ON DELETE SET NULL,
  fechado_em timestamptz NOT NULL DEFAULT now(),
  justificativa_reabertura text,
  reaberto_em timestamptz,
  UNIQUE (empresa_id, competencia)
);

CREATE TABLE public.relatorios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  titulo text NOT NULL DEFAULT 'Relatorio Mensal',
  blocos jsonb NOT NULL DEFAULT '[]'::jsonb,
  textos jsonb NOT NULL DEFAULT '{}'::jsonb,
  versao integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.configuracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL UNIQUE REFERENCES public.empresas(id) ON DELETE CASCADE,
  margem_desejada numeric(6,2) NOT NULL DEFAULT 15,
  limite_atencao numeric(6,2) NOT NULL DEFAULT 20,
  regras jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER configuracoes_updated
BEFORE UPDATE ON public.configuracoes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.projeto_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  perfil text NOT NULL CHECK (perfil IN ('interno', 'externo')),
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, user_id)
);

CREATE TRIGGER projeto_usuarios_updated
BEFORE UPDATE ON public.projeto_usuarios
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.can_access_empresa(_user_id uuid, _empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.empresas e
      WHERE e.id = _empresa_id
        AND e.created_by = _user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.projeto_usuarios pu
      WHERE pu.empresa_id = _empresa_id
        AND pu.user_id = _user_id
        AND pu.ativo = true
    );
$$;

CREATE TABLE public.nibo_project_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL UNIQUE REFERENCES public.empresas(id) ON DELETE CASCADE,
  nibo_company_id text NOT NULL,
  nibo_company_name text NOT NULL DEFAULT '',
  nibo_enabled boolean NOT NULL DEFAULT false,
  auto_sync_enabled boolean NOT NULL DEFAULT false,
  sync_start_date date,
  lookback_days integer NOT NULL DEFAULT 7 CHECK (lookback_days BETWEEN 1 AND 90),
  last_verified_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX nibo_project_configs_company_idx
ON public.nibo_project_configs (nibo_company_id);

CREATE TRIGGER nibo_project_configs_updated
BEFORE UPDATE ON public.nibo_project_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.nibo_sync_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.nibo_sync_runs(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo public.tipo_lancamento NOT NULL,
  nibo_company_id text NOT NULL,
  nibo_company_name text NOT NULL DEFAULT '',
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed', 'skipped')),
  registros_encontrados integer NOT NULL DEFAULT 0,
  registros_inseridos integer NOT NULL DEFAULT 0,
  registros_atualizados integer NOT NULL DEFAULT 0,
  registros_ignorados integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX nibo_sync_items_empresa_started_idx
ON public.nibo_sync_items (empresa_id, started_at DESC);

CREATE TABLE public.nibo_sync_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo public.tipo_lancamento NOT NULL,
  last_successful_sync_at timestamptz,
  last_attempt_at timestamptz,
  last_period_start date,
  last_period_end date,
  status text NOT NULL DEFAULT 'never_synced' CHECK (status IN ('never_synced', 'success', 'failed', 'skipped')),
  last_error text,
  last_run_item_id uuid REFERENCES public.nibo_sync_items(id) ON DELETE SET NULL,
  registros_encontrados integer NOT NULL DEFAULT 0,
  registros_inseridos integer NOT NULL DEFAULT 0,
  registros_atualizados integer NOT NULL DEFAULT 0,
  registros_ignorados integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, tipo)
);

CREATE TRIGGER nibo_sync_states_updated
BEFORE UPDATE ON public.nibo_sync_states
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fluxo_contas_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  imagem_url text,
  UNIQUE (empresa_id, nome)
);

CREATE TRIGGER fluxo_contas_bancarias_updated
BEFORE UPDATE ON public.fluxo_contas_bancarias
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fluxo_saldos_bancarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  conta_id uuid NOT NULL REFERENCES public.fluxo_contas_bancarias(id) ON DELETE CASCADE,
  saldo numeric(14,2) NOT NULL DEFAULT 0,
  informado_em timestamptz NOT NULL DEFAULT now(),
  informado_por uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fluxo_saldos_conta_informado_idx
ON public.fluxo_saldos_bancarios (conta_id, informado_em DESC);

CREATE TABLE public.fluxo_ajustes_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  lancamento_id uuid NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,
  data_projetada date NOT NULL,
  motivo text,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, lancamento_id)
);

CREATE TRIGGER fluxo_ajustes_lancamentos_updated
BEFORE UPDATE ON public.fluxo_ajustes_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fluxo_titulos_nibo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  importacao_id uuid REFERENCES public.importacoes(id) ON DELETE CASCADE,
  tipo public.tipo_lancamento NOT NULL,
  vencimento date NOT NULL,
  data_projetada date NOT NULL,
  competencia date NOT NULL,
  descricao text NOT NULL DEFAULT '',
  categoria_nibo text,
  pessoa text,
  centro_custo text,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto', 'a_vencer', 'vencido', 'pendente', 'selecionado_pagamento', 'pago', 'recebido', 'cancelado')),
  hash text NOT NULL,
  external_source text,
  external_id text,
  source_content_hash text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, hash)
);

CREATE INDEX fluxo_titulos_empresa_data_idx
ON public.fluxo_titulos_nibo (empresa_id, data_projetada, tipo);

CREATE UNIQUE INDEX fluxo_titulos_external_source_id_idx
ON public.fluxo_titulos_nibo (empresa_id, external_source, external_id)
WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

CREATE TRIGGER fluxo_titulos_nibo_updated
BEFORE UPDATE ON public.fluxo_titulos_nibo
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fluxo_checklist_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  lancamento_id uuid REFERENCES public.lancamentos(id) ON DELETE CASCADE,
  titulo_id uuid REFERENCES public.fluxo_titulos_nibo(id) ON DELETE CASCADE,
  status public.status_checklist_fluxo NOT NULL DEFAULT 'nao_selecionado',
  observacao text,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, lancamento_id)
);

CREATE UNIQUE INDEX fluxo_checklist_titulo_unique_idx
ON public.fluxo_checklist_pagamentos (empresa_id, titulo_id)
WHERE titulo_id IS NOT NULL;

CREATE TRIGGER fluxo_checklist_pagamentos_updated
BEFORE UPDATE ON public.fluxo_checklist_pagamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fluxo_historicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  elaborado_em timestamptz NOT NULL DEFAULT now(),
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  saldo_inicial numeric(14,2) NOT NULL DEFAULT 0,
  recebimentos_previstos numeric(14,2) NOT NULL DEFAULT 0,
  pagamentos_previstos numeric(14,2) NOT NULL DEFAULT 0,
  saldo_final_previsto numeric(14,2) NOT NULL DEFAULT 0,
  contas_consideradas jsonb NOT NULL DEFAULT '[]'::jsonb,
  pagamentos_selecionados jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fluxo_historicos_empresa_elaborado_idx
ON public.fluxo_historicos (empresa_id, elaborado_em DESC);

COMMENT ON SCHEMA public IS 'Application schema. Row-level access rules were removed from this baseline and must be implemented by the application API.';
