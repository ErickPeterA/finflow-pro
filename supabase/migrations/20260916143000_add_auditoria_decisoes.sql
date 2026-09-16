CREATE TABLE public.auditoria_decisoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  chave_auditoria text NOT NULL,
  tipo_auditoria text NOT NULL,
  lancamento_id uuid REFERENCES public.lancamentos(id) ON DELETE SET NULL,
  acao text NOT NULL,
  sugestao text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, chave_auditoria)
);

CREATE INDEX auditoria_decisoes_empresa_idx
  ON public.auditoria_decisoes (empresa_id, updated_at DESC);

CREATE TRIGGER auditoria_decisoes_updated
BEFORE UPDATE ON public.auditoria_decisoes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
