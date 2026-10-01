CREATE TABLE public.solicitacao_pagamento_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES public.solicitacoes_pagamento(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome_arquivo text NOT NULL,
  tipo_mime text NOT NULL,
  tamanho_bytes integer NOT NULL CHECK (tamanho_bytes > 0 AND tamanho_bytes <= 8388608),
  conteudo bytea NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX solicitacao_pagamento_anexos_solicitacao_idx
  ON public.solicitacao_pagamento_anexos (solicitacao_id, created_at);

CREATE INDEX solicitacao_pagamento_anexos_empresa_idx
  ON public.solicitacao_pagamento_anexos (empresa_id);
