-- NIBO automatic synchronization support.
-- This migration is intentionally additive: manual imports keep working as-is.

CREATE TABLE IF NOT EXISTS public.nibo_project_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL UNIQUE REFERENCES public.empresas(id) ON DELETE CASCADE,
  nibo_company_id text NOT NULL,
  nibo_company_name text NOT NULL DEFAULT '',
  nibo_enabled boolean NOT NULL DEFAULT false,
  auto_sync_enabled boolean NOT NULL DEFAULT false,
  sync_start_date date,
  lookback_days integer NOT NULL DEFAULT 7 CHECK (lookback_days BETWEEN 1 AND 90),
  last_verified_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS nibo_project_configs_company_idx
ON public.nibo_project_configs (nibo_company_id);

CREATE TABLE IF NOT EXISTS public.nibo_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_source text NOT NULL DEFAULT 'manual' CHECK (trigger_source IN ('manual','scheduled','test')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','partial_success','failed')),
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
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS public.nibo_sync_items (
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
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','failed','skipped')),
  registros_encontrados integer NOT NULL DEFAULT 0,
  registros_inseridos integer NOT NULL DEFAULT 0,
  registros_atualizados integer NOT NULL DEFAULT 0,
  registros_ignorados integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nibo_sync_items_empresa_started_idx
ON public.nibo_sync_items (empresa_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.nibo_sync_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo public.tipo_lancamento NOT NULL,
  last_successful_sync_at timestamptz,
  last_attempt_at timestamptz,
  last_period_start date,
  last_period_end date,
  status text NOT NULL DEFAULT 'never_synced' CHECK (status IN ('never_synced','success','failed','skipped')),
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

ALTER TABLE public.importacoes
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual'
    CHECK (origem IN ('manual','nibo_auto')),
  ADD COLUMN IF NOT EXISTS periodo_inicio date,
  ADD COLUMN IF NOT EXISTS periodo_fim date,
  ADD COLUMN IF NOT EXISTS nibo_sync_run_id uuid REFERENCES public.nibo_sync_runs(id) ON DELETE SET NULL;

ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual'
    CHECK (origem IN ('manual','nibo_auto')),
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS source_content_hash text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS lancamentos_external_source_id_idx
ON public.lancamentos (empresa_id, external_source, external_id)
WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

CREATE TRIGGER nibo_project_configs_updated
BEFORE UPDATE ON public.nibo_project_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER nibo_sync_states_updated
BEFORE UPDATE ON public.nibo_sync_states
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER lancamentos_updated
BEFORE UPDATE ON public.lancamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nibo_project_configs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.nibo_sync_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.nibo_sync_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.nibo_sync_states TO authenticated;

GRANT ALL ON public.nibo_project_configs TO service_role;
GRANT ALL ON public.nibo_sync_runs TO service_role;
GRANT ALL ON public.nibo_sync_items TO service_role;
GRANT ALL ON public.nibo_sync_states TO service_role;

ALTER TABLE public.nibo_project_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nibo_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nibo_sync_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nibo_sync_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nibo_project_configs_all_scoped"
ON public.nibo_project_configs
FOR ALL
TO authenticated
USING (public.can_access_empresa(auth.uid(), empresa_id))
WITH CHECK (public.can_access_empresa(auth.uid(), empresa_id));

CREATE POLICY "nibo_sync_runs_select_admin_or_own"
ON public.nibo_sync_runs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR created_by = auth.uid());

CREATE POLICY "nibo_sync_runs_insert_own"
ON public.nibo_sync_runs
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "nibo_sync_runs_update_admin_or_own"
ON public.nibo_sync_runs
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR created_by = auth.uid())
WITH CHECK (public.has_role(auth.uid(), 'admin') OR created_by = auth.uid());

CREATE POLICY "nibo_sync_items_all_scoped"
ON public.nibo_sync_items
FOR ALL
TO authenticated
USING (public.can_access_empresa(auth.uid(), empresa_id))
WITH CHECK (public.can_access_empresa(auth.uid(), empresa_id));

CREATE POLICY "nibo_sync_states_all_scoped"
ON public.nibo_sync_states
FOR ALL
TO authenticated
USING (public.can_access_empresa(auth.uid(), empresa_id))
WITH CHECK (public.can_access_empresa(auth.uid(), empresa_id));
