import type { Lancamento } from "./dre";

export const CENTRO_CUSTO_TODOS = "__todos__";
export const CENTRO_CUSTO_SEM_CENTRO = "__sem_centro__";

export type CentroCustoFiltro = string;

export function centroCustoFiltroValue(centroCusto: string | null | undefined) {
  return centroCusto?.trim() || CENTRO_CUSTO_SEM_CENTRO;
}

export function centroCustoFiltroLabel(value: string) {
  return value === CENTRO_CUSTO_SEM_CENTRO ? "Nenhum centro" : value;
}

export function opcoesCentroCusto(lancamentos: Lancamento[]) {
  const opcoes = new Map<string, string>();

  for (const lancamento of lancamentos) {
    const value = centroCustoFiltroValue(lancamento.centro_custo);
    if (!opcoes.has(value)) opcoes.set(value, centroCustoFiltroLabel(value));
  }

  return [...opcoes.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => {
      if (a.value === CENTRO_CUSTO_SEM_CENTRO) return 1;
      if (b.value === CENTRO_CUSTO_SEM_CENTRO) return -1;
      return a.label.localeCompare(b.label, "pt-BR");
    });
}

export function filtrarLancamentosPorCentroCusto(
  lancamentos: Lancamento[],
  centroCusto: CentroCustoFiltro,
) {
  if (centroCusto === CENTRO_CUSTO_TODOS) return lancamentos;
  return lancamentos.filter(
    (lancamento) => centroCustoFiltroValue(lancamento.centro_custo) === centroCusto,
  );
}
