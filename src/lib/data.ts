import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Categoria, Lancamento } from "./dre";
import type { Database } from "@/integrations/supabase/types";

export type Cargo = Database["public"]["Enums"]["app_role"];

export interface Empresa {
  id: string;
  nome: string;
  cnpj: string | null;
  cor_primaria: string;
  logo_url: string | null;
  ativo: boolean;
}

export function useEmpresas() {
  return useQuery({
    queryKey: ["empresas"],
    queryFn: async (): Promise<Empresa[]> => {
      const { data, error } = await supabase
        .from("empresas")
        .select("id, nome, cnpj, cor_primaria, logo_url, ativo")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Empresa[];
    },
  });
}

export function useMeuCargo() {
  return useQuery({
    queryKey: ["meu-cargo"],
    queryFn: async (): Promise<Cargo | null> => {
      const { data: usuario, error: userError } = await supabase.auth.getUser();
      if (userError || !usuario.user) return null;

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", usuario.user.id);

      if (error) throw error;

      const cargos = (data ?? []).map((r) => r.role);
      if (cargos.includes("admin")) return "admin";
      if (cargos.includes("consultor")) return "consultor";
      if (cargos.includes("cliente")) return "cliente";
      return null;
    },
  });
}

export function useCategorias(empresaId: string | null) {
  return useQuery({
    queryKey: ["categorias", empresaId],
    enabled: !!empresaId,
    queryFn: async (): Promise<Categoria[]> => {
      const { data, error } = await supabase
        .from("categorias")
        .select("*")
        .eq("empresa_id", empresaId!)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Categoria[];
    },
  });
}

export function useLancamentos(empresaId: string | null, ano: number) {
  return useQuery({
    queryKey: ["lancamentos", empresaId, ano],
    enabled: !!empresaId,
    queryFn: async (): Promise<Lancamento[]> => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("*")
        .eq("empresa_id", empresaId!)
        .gte("competencia", `${ano}-01-01`)
        .lte("competencia", `${ano}-12-01`)
        .order("data_efetiva");
      if (error) throw error;
      return (data ?? []) as unknown as Lancamento[];
    },
  });
}

export function useMetas(empresaId: string | null, ano: number) {
  return useQuery({
    queryKey: ["metas", empresaId, ano],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("metas")
        .select("*")
        .eq("empresa_id", empresaId!)
        .gte("competencia", `${ano}-01-01`)
        .lte("competencia", `${ano}-12-01`);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useConfiguracao(empresaId: string | null) {
  return useQuery({
    queryKey: ["configuracoes", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracoes")
        .select("*")
        .eq("empresa_id", empresaId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useImportacoes(empresaId: string | null) {
  return useQuery({
    queryKey: ["importacoes", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("importacoes")
        .select("*")
        .eq("empresa_id", empresaId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePlanosAcao(empresaId: string | null) {
  return useQuery({
    queryKey: ["planos_acao", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planos_acao")
        .select("*")
        .eq("empresa_id", empresaId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePeriodos(empresaId: string | null) {
  return useQuery({
    queryKey: ["periodos", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("periodos_fechados")
        .select("*")
        .eq("empresa_id", empresaId!)
        .order("competencia");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMapeamentos(empresaId: string | null) {
  return useQuery({
    queryKey: ["mapeamentos", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mapeamentos")
        .select("*")
        .eq("empresa_id", empresaId!)
        .order("categoria_nibo");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRelatorios(empresaId: string | null) {
  return useQuery({
    queryKey: ["relatorios", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("relatorios")
        .select("*")
        .eq("empresa_id", empresaId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
