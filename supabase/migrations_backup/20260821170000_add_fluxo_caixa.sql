DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_checklist_fluxo') THEN
    CREATE TYPE public.status_checklist_fluxo AS ENUM (
      'nao_selecionado',
      'selecionado_pagamento',
      'identificado_pago'
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.fluxo_contas_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, nome)
);

CREATE TABLE IF NOT EXISTS public.fluxo_saldos_bancarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  conta_id uuid NOT NULL REFERENCES public.fluxo_contas_bancarias(id) ON DELETE CASCADE,
  saldo numeric(14,2) NOT NULL DEFAULT 0,
  informado_em timestamptz NOT NULL DEFAULT now(),
  informado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fluxo_saldos_conta_informado_idx
ON public.fluxo_saldos_bancarios (conta_id, informado_em DESC);

CREATE TABLE IF NOT EXISTS public.fluxo_ajustes_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  lancamento_id uuid NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,
  data_projetada date NOT NULL,
  motivo text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, lancamento_id)
);

CREATE TABLE IF NOT EXISTS public.fluxo_checklist_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  lancamento_id uuid NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,
  status public.status_checklist_fluxo NOT NULL DEFAULT 'nao_selecionado',
  observacao text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, lancamento_id)
);

CREATE TABLE IF NOT EXISTS public.fluxo_historicos (
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
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fluxo_historicos_empresa_elaborado_idx
ON public.fluxo_historicos (empresa_id, elaborado_em DESC);

CREATE TRIGGER fluxo_contas_bancarias_updated
BEFORE UPDATE ON public.fluxo_contas_bancarias
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER fluxo_ajustes_lancamentos_updated
BEFORE UPDATE ON public.fluxo_ajustes_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER fluxo_checklist_pagamentos_updated
BEFORE UPDATE ON public.fluxo_checklist_pagamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fluxo_contas_bancarias TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fluxo_saldos_bancarios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fluxo_ajustes_lancamentos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fluxo_checklist_pagamentos TO authenticated;
GRANT SELECT, INSERT ON public.fluxo_historicos TO authenticated;

GRANT ALL ON public.fluxo_contas_bancarias TO service_role;
GRANT ALL ON public.fluxo_saldos_bancarios TO service_role;
GRANT ALL ON public.fluxo_ajustes_lancamentos TO service_role;
GRANT ALL ON public.fluxo_checklist_pagamentos TO service_role;
GRANT ALL ON public.fluxo_historicos TO service_role;

ALTER TABLE public.fluxo_contas_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fluxo_saldos_bancarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fluxo_ajustes_lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fluxo_checklist_pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fluxo_historicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fluxo_contas_bancarias_all_scoped"
ON public.fluxo_contas_bancarias
FOR ALL
TO authenticated
USING (public.can_access_empresa(auth.uid(), empresa_id))
WITH CHECK (public.can_access_empresa(auth.uid(), empresa_id));

CREATE POLICY "fluxo_saldos_bancarios_all_scoped"
ON public.fluxo_saldos_bancarios
FOR ALL
TO authenticated
USING (public.can_access_empresa(auth.uid(), empresa_id))
WITH CHECK (public.can_access_empresa(auth.uid(), empresa_id));

CREATE POLICY "fluxo_ajustes_lancamentos_all_scoped"
ON public.fluxo_ajustes_lancamentos
FOR ALL
TO authenticated
USING (public.can_access_empresa(auth.uid(), empresa_id))
WITH CHECK (public.can_access_empresa(auth.uid(), empresa_id));

CREATE POLICY "fluxo_checklist_pagamentos_all_scoped"
ON public.fluxo_checklist_pagamentos
FOR ALL
TO authenticated
USING (public.can_access_empresa(auth.uid(), empresa_id))
WITH CHECK (public.can_access_empresa(auth.uid(), empresa_id));

CREATE POLICY "fluxo_historicos_select_scoped"
ON public.fluxo_historicos
FOR SELECT
TO authenticated
USING (public.can_access_empresa(auth.uid(), empresa_id));

CREATE POLICY "fluxo_historicos_insert_scoped"
ON public.fluxo_historicos
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_empresa(auth.uid(), empresa_id));
