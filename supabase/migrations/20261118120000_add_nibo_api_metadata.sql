-- Metadados aditivos da API oficial do Nibo.
-- Mantida no repositorio porque esta versao ja pode existir no historico de
-- migrations de ambientes locais. A sincronizacao nao depende destas colunas.
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS nibo_reference text,
  ADD COLUMN IF NOT EXISTS stakeholder_document text,
  ADD COLUMN IF NOT EXISTS category_parent text,
  ADD COLUMN IF NOT EXISTS source_payload jsonb;

COMMENT ON COLUMN public.lancamentos.source_payload IS
  'Payload original da API Nibo, sem credenciais, para auditoria e reprocessamento.';
