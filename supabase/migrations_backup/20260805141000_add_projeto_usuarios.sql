CREATE TABLE IF NOT EXISTS public.projeto_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  perfil text NOT NULL CHECK (perfil IN ('interno', 'externo')),
  cargo text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, user_id)
);

GRANT SELECT ON public.projeto_usuarios TO authenticated;
GRANT ALL ON public.projeto_usuarios TO service_role;

ALTER TABLE public.projeto_usuarios ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_empresa(_user_id uuid, _empresa_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.empresas e
      WHERE e.id = _empresa_id
        AND e.created_by = _user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.projeto_usuarios pu
      WHERE pu.empresa_id = _empresa_id
        AND pu.user_id = _user_id
        AND pu.ativo = true
    )
$$;

REVOKE ALL ON FUNCTION public.can_access_empresa(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_empresa(uuid, uuid) TO authenticated, service_role;

CREATE POLICY "projeto_usuarios_select_scoped"
ON public.projeto_usuarios
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR user_id = auth.uid()
  OR public.can_access_empresa(auth.uid(), empresa_id)
);

CREATE TRIGGER projeto_usuarios_updated
BEFORE UPDATE ON public.projeto_usuarios
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "empresas_select" ON public.empresas;
CREATE POLICY "empresas_select_scoped"
ON public.empresas
FOR SELECT
TO authenticated
USING (public.can_access_empresa(auth.uid(), id));

DROP POLICY IF EXISTS "empresas_update" ON public.empresas;
CREATE POLICY "empresas_update_scoped"
ON public.empresas
FOR UPDATE
TO authenticated
USING (public.can_access_empresa(auth.uid(), id))
WITH CHECK (public.can_access_empresa(auth.uid(), id));

DROP POLICY IF EXISTS "categorias_all" ON public.categorias;
CREATE POLICY "categorias_all_scoped"
ON public.categorias
FOR ALL
TO authenticated
USING (public.can_access_empresa(auth.uid(), empresa_id))
WITH CHECK (public.can_access_empresa(auth.uid(), empresa_id));

DROP POLICY IF EXISTS "mapeamentos_all" ON public.mapeamentos;
CREATE POLICY "mapeamentos_all_scoped"
ON public.mapeamentos
FOR ALL
TO authenticated
USING (public.can_access_empresa(auth.uid(), empresa_id))
WITH CHECK (public.can_access_empresa(auth.uid(), empresa_id));

DROP POLICY IF EXISTS "importacoes_all" ON public.importacoes;
CREATE POLICY "importacoes_all_scoped"
ON public.importacoes
FOR ALL
TO authenticated
USING (public.can_access_empresa(auth.uid(), empresa_id))
WITH CHECK (public.can_access_empresa(auth.uid(), empresa_id));

DROP POLICY IF EXISTS "lancamentos_all" ON public.lancamentos;
CREATE POLICY "lancamentos_all_scoped"
ON public.lancamentos
FOR ALL
TO authenticated
USING (public.can_access_empresa(auth.uid(), empresa_id))
WITH CHECK (public.can_access_empresa(auth.uid(), empresa_id));

DROP POLICY IF EXISTS "metas_all" ON public.metas;
CREATE POLICY "metas_all_scoped"
ON public.metas
FOR ALL
TO authenticated
USING (public.can_access_empresa(auth.uid(), empresa_id))
WITH CHECK (public.can_access_empresa(auth.uid(), empresa_id));

DROP POLICY IF EXISTS "planos_acao_all" ON public.planos_acao;
CREATE POLICY "planos_acao_all_scoped"
ON public.planos_acao
FOR ALL
TO authenticated
USING (public.can_access_empresa(auth.uid(), empresa_id))
WITH CHECK (public.can_access_empresa(auth.uid(), empresa_id));

DROP POLICY IF EXISTS "periodos_select" ON public.periodos_fechados;
CREATE POLICY "periodos_select_scoped"
ON public.periodos_fechados
FOR SELECT
TO authenticated
USING (public.can_access_empresa(auth.uid(), empresa_id));

DROP POLICY IF EXISTS "periodos_insert" ON public.periodos_fechados;
CREATE POLICY "periodos_insert_scoped"
ON public.periodos_fechados
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_empresa(auth.uid(), empresa_id));

DROP POLICY IF EXISTS "periodos_update" ON public.periodos_fechados;
CREATE POLICY "periodos_update_scoped"
ON public.periodos_fechados
FOR UPDATE
TO authenticated
USING (public.can_access_empresa(auth.uid(), empresa_id))
WITH CHECK (public.can_access_empresa(auth.uid(), empresa_id));

DROP POLICY IF EXISTS "relatorios_all" ON public.relatorios;
CREATE POLICY "relatorios_all_scoped"
ON public.relatorios
FOR ALL
TO authenticated
USING (public.can_access_empresa(auth.uid(), empresa_id))
WITH CHECK (public.can_access_empresa(auth.uid(), empresa_id));

DROP POLICY IF EXISTS "configuracoes_all" ON public.configuracoes;
CREATE POLICY "configuracoes_all_scoped"
ON public.configuracoes
FOR ALL
TO authenticated
USING (public.can_access_empresa(auth.uid(), empresa_id))
WITH CHECK (public.can_access_empresa(auth.uid(), empresa_id));
