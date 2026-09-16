CREATE TABLE public.auditoria_categoria_importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_arquivo text NOT NULL,
  total_abas integer NOT NULL DEFAULT 0,
  total_categorias integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.auditoria_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'planilha')),
  aba_origem text,
  importacao_id uuid REFERENCES public.auditoria_categoria_importacoes(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, nome)
);

CREATE INDEX auditoria_categorias_empresa_idx
  ON public.auditoria_categorias (empresa_id, ativo, nome);

CREATE TRIGGER auditoria_categorias_updated
BEFORE UPDATE ON public.auditoria_categorias
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
