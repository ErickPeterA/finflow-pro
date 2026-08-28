import type { Lancamento } from "./dre";

export const CENTRO_CUSTO_TODOS = "__todos__";
export const CENTRO_CUSTO_SEM_CENTRO = "__sem_centro__";

export type CentroCustoFiltro = string[];

type RegistroComCentroCusto = {
  centro_custo: string | null;
};

export function centroCustoFiltroValue(centroCusto: string | null | undefined) {
  return centroCusto?.trim() || CENTRO_CUSTO_SEM_CENTRO;
}

export function centroCustoFiltroLabel(value: string) {
  return value === CENTRO_CUSTO_SEM_CENTRO ? "Nenhum centro" : value;
}

export function opcoesCentroCusto(lancamentos: RegistroComCentroCusto[]) {
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
): Lancamento[];
export function filtrarLancamentosPorCentroCusto<T extends RegistroComCentroCusto>(
  lancamentos: T[],
  centroCusto: CentroCustoFiltro,
): T[];
export function filtrarLancamentosPorCentroCusto<T extends RegistroComCentroCusto>(
  lancamentos: T[],
  centroCusto: CentroCustoFiltro,
) {
  if (centroCusto.length === 0 || centroCusto.includes(CENTRO_CUSTO_TODOS)) return lancamentos;
  const centrosSelecionados = new Set(centroCusto);
  return lancamentos.filter((lancamento) =>
    centrosSelecionados.has(centroCustoFiltroValue(lancamento.centro_custo)),
  );
}
