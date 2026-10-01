CREATE TABLE public.auditoria_regras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo_auditoria text NOT NULL,
  fornecedor_normalizado text,
  categoria_origem_id uuid REFERENCES public.categorias(id) ON DELETE SET NULL,
  categoria_destino_id uuid REFERENCES public.categorias(id) ON DELETE SET NULL,
  acao text NOT NULL CHECK (acao IN ('excecao', 'sugestao')),
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auditoria_regras_empresa_idx
  ON public.auditoria_regras (empresa_id, ativo, tipo_auditoria);

CREATE TRIGGER auditoria_regras_updated
BEFORE UPDATE ON public.auditoria_regras
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
