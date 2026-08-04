-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin','consultor','cliente');
CREATE TYPE public.grupo_dre AS ENUM ('receita_operacional','deducoes','custos','despesas','financeiro','nao_operacional');
CREATE TYPE public.tipo_lancamento AS ENUM ('recebida','paga');
CREATE TYPE public.tratamento_lancamento AS ENUM ('operacional','transferencia','emprestimo','aporte','resgate','aplicacao','investimento','compra_ativo','reembolso','estorno','juros','multa','tarifa','receita_financeira');
CREATE TYPE public.classificacao_custo AS ENUM ('fixo','variavel');
CREATE TYPE public.status_acao AS ENUM ('pendente','em_andamento','aguardando_cliente','atrasado','concluido','cancelado');

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'consultor') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- EMPRESAS
CREATE TABLE public.empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnpj text,
  cor_primaria text NOT NULL DEFAULT '#0B2545',
  logo_url text,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresas TO authenticated;
GRANT ALL ON public.empresas TO service_role;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "empresas_select" ON public.empresas FOR SELECT TO authenticated USING (true);
CREATE POLICY "empresas_insert" ON public.empresas FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "empresas_update" ON public.empresas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "empresas_delete_admin" ON public.empresas FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER empresas_updated BEFORE UPDATE ON public.empresas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CATEGORIAS (plano de contas)
CREATE TABLE public.categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  grupo public.grupo_dre NOT NULL,
  nome text NOT NULL,
  classificacao public.classificacao_custo NOT NULL DEFAULT 'variavel',
  recorrente boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, grupo, nome)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorias TO authenticated;
GRANT ALL ON public.categorias TO service_role;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categorias_all" ON public.categorias FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- MAPEAMENTOS NIBO
CREATE TABLE public.mapeamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  categoria_nibo text NOT NULL,
  categoria_id uuid REFERENCES public.categorias(id) ON DELETE SET NULL,
  tratamento public.tratamento_lancamento NOT NULL DEFAULT 'operacional',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, categoria_nibo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mapeamentos TO authenticated;
GRANT ALL ON public.mapeamentos TO service_role;
ALTER TABLE public.mapeamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mapeamentos_all" ON public.mapeamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- IMPORTACOES
CREATE TABLE public.importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo public.tipo_lancamento NOT NULL,
  competencia date NOT NULL,
  arquivo_nome text NOT NULL,
  arquivo_path text,
  total_registros integer NOT NULL DEFAULT 0,
  duplicados integer NOT NULL DEFAULT 0,
  valor_total numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'confirmada',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.importacoes TO authenticated;
GRANT ALL ON public.importacoes TO service_role;
ALTER TABLE public.importacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "importacoes_all" ON public.importacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- LANCAMENTOS
CREATE TABLE public.lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  importacao_id uuid REFERENCES public.importacoes(id) ON DELETE CASCADE,
  tipo public.tipo_lancamento NOT NULL,
  data_efetiva date NOT NULL,
  competencia date NOT NULL,
  descricao text NOT NULL DEFAULT '',
  categoria_nibo text,
  categoria_id uuid REFERENCES public.categorias(id) ON DELETE SET NULL,
  pessoa text,
  centro_custo text,
  conta_bancaria text,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  tratamento public.tratamento_lancamento NOT NULL DEFAULT 'operacional',
  nao_recorrente boolean NOT NULL DEFAULT false,
  hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, hash)
);
CREATE INDEX lancamentos_empresa_comp_idx ON public.lancamentos (empresa_id, competencia);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lancamentos TO authenticated;
GRANT ALL ON public.lancamentos TO service_role;
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lancamentos_all" ON public.lancamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- METAS
CREATE TABLE public.metas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  tipo text NOT NULL,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, competencia, tipo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas TO authenticated;
GRANT ALL ON public.metas TO service_role;
ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "metas_all" ON public.metas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- PLANOS DE ACAO
CREATE TABLE public.planos_acao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  categoria text,
  problema text NOT NULL,
  acao text NOT NULL,
  responsavel text,
  prazo date,
  prioridade text NOT NULL DEFAULT 'media',
  status public.status_acao NOT NULL DEFAULT 'pendente',
  resultado_esperado text,
  comentarios text,
  evidencias text,
  concluido_em date,
  competencia_origem date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planos_acao TO authenticated;
GRANT ALL ON public.planos_acao TO service_role;
ALTER TABLE public.planos_acao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "planos_acao_all" ON public.planos_acao FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER planos_acao_updated BEFORE UPDATE ON public.planos_acao FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PERIODOS FECHADOS
CREATE TABLE public.periodos_fechados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  fechado boolean NOT NULL DEFAULT true,
  fechado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  fechado_em timestamptz NOT NULL DEFAULT now(),
  justificativa_reabertura text,
  reaberto_em timestamptz,
  UNIQUE (empresa_id, competencia)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.periodos_fechados TO authenticated;
GRANT ALL ON public.periodos_fechados TO service_role;
ALTER TABLE public.periodos_fechados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "periodos_select" ON public.periodos_fechados FOR SELECT TO authenticated USING (true);
CREATE POLICY "periodos_insert" ON public.periodos_fechados FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "periodos_update" ON public.periodos_fechados FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "periodos_delete_admin" ON public.periodos_fechados FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- RELATORIOS
CREATE TABLE public.relatorios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  titulo text NOT NULL DEFAULT 'Relatório Mensal',
  blocos jsonb NOT NULL DEFAULT '[]'::jsonb,
  textos jsonb NOT NULL DEFAULT '{}'::jsonb,
  versao integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.relatorios TO authenticated;
GRANT ALL ON public.relatorios TO service_role;
ALTER TABLE public.relatorios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "relatorios_all" ON public.relatorios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CONFIGURACOES
CREATE TABLE public.configuracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL UNIQUE REFERENCES public.empresas(id) ON DELETE CASCADE,
  margem_desejada numeric(6,2) NOT NULL DEFAULT 15,
  limite_atencao numeric(6,2) NOT NULL DEFAULT 20,
  regras jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.configuracoes TO authenticated;
GRANT ALL ON public.configuracoes TO service_role;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "configuracoes_all" ON public.configuracoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER configuracoes_updated BEFORE UPDATE ON public.configuracoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();