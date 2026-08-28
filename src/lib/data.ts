import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Categoria, Lancamento } from "./dre";
import type { Database } from "@/integrations/supabase/types";

export type Cargo = Database["public"]["Enums"]["app_role"];
export type PerfilProjeto = "interno" | "externo";

export interface Empresa {
  id: string;
  nome: string;
  cnpj: string | null;
  cor_primaria: string;
  logo_url: string | null;
  ativo: boolean;
}

export type FluxoContaBancaria = Database["public"]["Tables"]["fluxo_contas_bancarias"]["Row"];
export type FluxoSaldoBancario = Database["public"]["Tables"]["fluxo_saldos_bancarios"]["Row"];
export type FluxoAjusteLancamento =
  Database["public"]["Tables"]["fluxo_ajustes_lancamentos"]["Row"];
export type FluxoChecklistPagamento =
  Database["public"]["Tables"]["fluxo_checklist_pagamentos"]["Row"];
export type FluxoTituloNibo = Database["public"]["Tables"]["fluxo_titulos_nibo"]["Row"];
export type StatusChecklistFluxo = Database["public"]["Enums"]["status_checklist_fluxo"];

export function useEmpresas() {
  return useQuery({
    queryKey: ["empresas"],
    staleTime: 60_000,
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

export function useEmpresaAtual(empresaId: string | null) {
  return useQuery({
    queryKey: ["empresa", empresaId],
    enabled: !!empresaId,
    staleTime: 60_000,
    queryFn: async (): Promise<Empresa | null> => {
      const { data, error } = await supabase
        .from("empresas")
        .select("id, nome, cnpj, cor_primaria, logo_url, ativo")
        .eq("id", empresaId!)
        .maybeSingle();
      if (error) throw error;
      return data as Empresa | null;
    },
  });
}

export function useMeuCargo() {
  return useQuery({
    queryKey: ["meu-cargo"],
    staleTime: 60_000,
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

export function usePerfilProjetoAtual(empresaId: string | null) {
  return useQuery({
    queryKey: ["perfil-projeto-atual", empresaId],
    enabled: !!empresaId,
    staleTime: 60_000,
    queryFn: async (): Promise<PerfilProjeto | null> => {
      const { data: usuario, error: userError } = await supabase.auth.getUser();
      if (userError || !usuario.user) return null;

      const { data, error } = await supabase
        .from("projeto_usuarios")
        .select("perfil")
        .eq("empresa_id", empresaId!)
        .eq("user_id", usuario.user.id)
        .eq("ativo", true)
        .maybeSingle();

      if (error) throw error;
      return data?.perfil === "externo" ? "externo" : data?.perfil === "interno" ? "interno" : null;
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
      const pageSize = 1000;
      const lancamentos: Lancamento[] = [];
      const idsVistos = new Set<string>();

      for (let from = 0; ; from += pageSize) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
          .from("lancamentos")
          .select("*")
          .eq("empresa_id", empresaId!)
          .gte("competencia", `${ano}-01-01`)
          .lte("competencia", `${ano}-12-01`)
          .order("competencia")
          .order("data_efetiva")
          .order("id")
          .range(from, to);
        if (error) throw error;

        const pagina = (data ?? []) as unknown as Lancamento[];
        for (const lancamento of pagina) {
          if (idsVistos.has(lancamento.id)) continue;
          idsVistos.add(lancamento.id);
          lancamentos.push(lancamento);
        }
        if (pagina.length < pageSize) break;
      }

      return lancamentos;
    },
  });
}

export function useLancamentoHashes(empresaId: string | null, ano: number) {
  return useQuery({
    queryKey: ["lancamento-hashes", empresaId, ano],
    enabled: !!empresaId,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const pageSize = 1000;
      const hashes: string[] = [];

      for (let from = 0; ; from += pageSize) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
          .from("lancamentos")
          .select("hash")
          .eq("empresa_id", empresaId!)
          .gte("competencia", `${ano}-01-01`)
          .lte("competencia", `${ano}-12-01`)
          .range(from, to);
        if (error) throw error;

        const pagina = data ?? [];
        hashes.push(...pagina.map((linha) => linha.hash).filter((hash): hash is string => !!hash));
        if (pagina.length < pageSize) break;
      }

      return hashes;
    },
  });
}

export function useCentrosCusto(empresaId: string | null, ano: number) {
  return useQuery({
    queryKey: ["centros-custo", empresaId, ano],
    enabled: !!empresaId,
    staleTime: 60_000,
    queryFn: async (): Promise<Array<{ centro_custo: string | null }>> => {
      const pageSize = 1000;
      const centros = new Map<string, string | null>();

      for (let from = 0; ; from += pageSize) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
          .from("lancamentos")
          .select("centro_custo")
          .eq("empresa_id", empresaId!)
          .gte("competencia", `${ano}-01-01`)
          .lte("competencia", `${ano}-12-01`)
          .range(from, to);
        if (error) throw error;

        const pagina = data ?? [];
        for (const linha of pagina) {
          const centro = linha.centro_custo?.trim() || null;
          centros.set(centro ?? "__sem_centro__", centro);
        }
        if (pagina.length < pageSize) break;
      }

      return [...centros.values()].map((centro_custo) => ({ centro_custo }));
    },
  });
}

export function useLancamentosFluxo(empresaId: string | null, inicio: string, fim: string) {
  return useQuery({
    queryKey: ["lancamentos-fluxo", empresaId, inicio, fim],
    enabled: !!empresaId,
    queryFn: async (): Promise<Lancamento[]> => {
      const pageSize = 1000;
      const lancamentos: Lancamento[] = [];
      const idsVistos = new Set<string>();

      for (let from = 0; ; from += pageSize) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
          .from("lancamentos")
          .select("*")
          .eq("empresa_id", empresaId!)
          .gte("data_efetiva", inicio)
          .lte("data_efetiva", fim)
          .order("data_efetiva")
          .order("id")
          .range(from, to);
        if (error) throw error;

        const pagina = (data ?? []) as unknown as Lancamento[];
        for (const lancamento of pagina) {
          if (idsVistos.has(lancamento.id)) continue;
          idsVistos.add(lancamento.id);
          lancamentos.push(lancamento);
        }
        if (pagina.length < pageSize) break;
      }

      return lancamentos;
    },
  });
}

export function useLancamentosReceberVencidos(empresaId: string | null, hoje: string) {
  return useQuery({
    queryKey: ["lancamentos-receber-vencidos", empresaId, hoje],
    enabled: !!empresaId,
    queryFn: async (): Promise<Lancamento[]> => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("*")
        .eq("empresa_id", empresaId!)
        .eq("tipo", "recebida")
        .lt("data_efetiva", hoje)
        .order("data_efetiva")
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Lancamento[];
    },
  });
}

export function useFluxoContasBancarias(empresaId: string | null) {
  return useQuery({
    queryKey: ["fluxo-contas-bancarias", empresaId],
    enabled: !!empresaId,
    queryFn: async (): Promise<FluxoContaBancaria[]> => {
      const { data, error } = await supabase
        .from("fluxo_contas_bancarias")
        .select("*")
        .eq("empresa_id", empresaId!)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFluxoSaldosBancarios(empresaId: string | null) {
  return useQuery({
    queryKey: ["fluxo-saldos-bancarios", empresaId],
    enabled: !!empresaId,
    queryFn: async (): Promise<FluxoSaldoBancario[]> => {
      const { data, error } = await supabase
        .from("fluxo_saldos_bancarios")
        .select("*")
        .eq("empresa_id", empresaId!)
        .order("informado_em", { ascending: false });
      if (error) throw error;

      const vistos = new Set<string>();
      return (data ?? []).filter((saldo) => {
        if (vistos.has(saldo.conta_id)) return false;
        vistos.add(saldo.conta_id);
        return true;
      });
    },
  });
}

export function useFluxoAjustesLancamentos(empresaId: string | null) {
  return useQuery({
    queryKey: ["fluxo-ajustes-lancamentos", empresaId],
    enabled: !!empresaId,
    queryFn: async (): Promise<FluxoAjusteLancamento[]> => {
      const { data, error } = await supabase
        .from("fluxo_ajustes_lancamentos")
        .select("*")
        .eq("empresa_id", empresaId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFluxoChecklistPagamentos(empresaId: string | null) {
  return useQuery({
    queryKey: ["fluxo-checklist-pagamentos", empresaId],
    enabled: !!empresaId,
    queryFn: async (): Promise<FluxoChecklistPagamento[]> => {
      const { data, error } = await supabase
        .from("fluxo_checklist_pagamentos")
        .select("*")
        .eq("empresa_id", empresaId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFluxoTitulosNibo(empresaId: string | null, inicio: string, fim: string) {
  return useQuery({
    queryKey: ["fluxo-titulos-nibo", empresaId, inicio, fim],
    enabled: !!empresaId,
    queryFn: async (): Promise<FluxoTituloNibo[]> => {
      const { data, error } = await supabase
        .from("fluxo_titulos_nibo")
        .select("*")
        .eq("empresa_id", empresaId!)
        .gte("data_projetada", inicio)
        .lte("data_projetada", fim)
        .neq("status", "cancelado")
        .order("data_projetada")
        .order("id");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFluxoTitulosReceberVencidos(empresaId: string | null, hoje: string) {
  return useQuery({
    queryKey: ["fluxo-titulos-receber-vencidos", empresaId, hoje],
    enabled: !!empresaId,
    queryFn: async (): Promise<FluxoTituloNibo[]> => {
      const { data, error } = await supabase
        .from("fluxo_titulos_nibo")
        .select("*")
        .eq("empresa_id", empresaId!)
        .eq("tipo", "recebida")
        .lt("vencimento", hoje)
        .neq("status", "cancelado")
        .order("vencimento")
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFluxoTitulosPagarVencidos(empresaId: string | null, hoje: string) {
  return useQuery({
    queryKey: ["fluxo-titulos-pagar-vencidos", empresaId, hoje],
    enabled: !!empresaId,
    queryFn: async (): Promise<FluxoTituloNibo[]> => {
      const { data, error } = await supabase
        .from("fluxo_titulos_nibo")
        .select("*")
        .eq("empresa_id", empresaId!)
        .eq("tipo", "paga")
        .lt("vencimento", hoje)
        .neq("status", "cancelado")
        .neq("status", "pago")
        .neq("status", "recebido")
        .order("vencimento")
        .limit(50);
      if (error) throw error;
      return data ?? [];
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
