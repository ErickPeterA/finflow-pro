CREATE TABLE IF NOT EXISTS public.fluxo_titulos_nibo (
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
    CHECK (status IN ('aberto','a_vencer','vencido','pendente','selecionado_pagamento','pago','recebido','cancelado')),
  hash text NOT NULL,
  external_source text,
  external_id text,
  source_content_hash text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, hash)
);

CREATE INDEX IF NOT EXISTS fluxo_titulos_empresa_data_idx
ON public.fluxo_titulos_nibo (empresa_id, data_projetada, tipo);

CREATE UNIQUE INDEX IF NOT EXISTS fluxo_titulos_external_source_id_idx
ON public.fluxo_titulos_nibo (empresa_id, external_source, external_id)
WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

ALTER TABLE public.fluxo_checklist_pagamentos
  ADD COLUMN IF NOT EXISTS titulo_id uuid REFERENCES public.fluxo_titulos_nibo(id) ON DELETE CASCADE;

ALTER TABLE public.fluxo_checklist_pagamentos
  ALTER COLUMN lancamento_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fluxo_checklist_titulo_unique_idx
ON public.fluxo_checklist_pagamentos (empresa_id, titulo_id)
WHERE titulo_id IS NOT NULL;

CREATE TRIGGER fluxo_titulos_nibo_updated
BEFORE UPDATE ON public.fluxo_titulos_nibo
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fluxo_titulos_nibo TO authenticated;
GRANT ALL ON public.fluxo_titulos_nibo TO service_role;

ALTER TABLE public.fluxo_titulos_nibo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fluxo_titulos_nibo_all_scoped"
ON public.fluxo_titulos_nibo
FOR ALL
TO authenticated
USING (public.can_access_empresa(auth.uid(), empresa_id))
WITH CHECK (public.can_access_empresa(auth.uid(), empresa_id));
