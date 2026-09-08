CREATE UNIQUE INDEX IF NOT EXISTS lancamentos_external_source_id_full_idx
ON public.lancamentos (empresa_id, external_source, external_id);
