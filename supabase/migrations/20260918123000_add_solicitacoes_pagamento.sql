CREATE TABLE public.solicitacoes_pagamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  solicitante_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  cliente text NOT NULL,
  cpf_cnpj text,
  categoria_trabalho text NOT NULL,
  descricao_trabalho text NOT NULL,
  prospeccao text,
  honorarios text,
  vencimento_pagamento text,
  contato_financeiro text,
  observacoes text,
  valor numeric(14,2),
  status text NOT NULL DEFAULT 'em_analise' CHECK (status IN ('em_analise', 'programada', 'paga', 'rejeitada', 'aguardando_ajuste')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX solicitacoes_pagamento_empresa_idx ON public.solicitacoes_pagamento (empresa_id, status, created_at DESC);
CREATE TRIGGER solicitacoes_pagamento_updated BEFORE UPDATE ON public.solicitacoes_pagamento FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
