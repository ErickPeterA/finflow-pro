ALTER TABLE public.planos_acao
ADD COLUMN IF NOT EXISTS relatorio_gerado_em timestamptz;

CREATE INDEX IF NOT EXISTS planos_acao_relatorio_gerado_em_idx
ON public.planos_acao (empresa_id, relatorio_gerado_em);
