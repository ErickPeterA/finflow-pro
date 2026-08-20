import { mesDaCompetencia, type Lancamento, type ResultadoMes } from "@/lib/dre";
import { meses } from "@/lib/format";

export type PeriodoFiltro =
  "mes_atual" | "tri1" | "tri2" | "tri3" | "tri4" | "sem1" | "sem2" | "ano";

export const periodosFiltro: Array<{ value: PeriodoFiltro; label: string }> = [
  { value: "mes_atual", label: "Mês selecionado" },
  { value: "tri1", label: "1º trimestre" },
  { value: "tri2", label: "2º trimestre" },
  { value: "tri3", label: "3º trimestre" },
  { value: "tri4", label: "4º trimestre" },
  { value: "sem1", label: "1º semestre" },
  { value: "sem2", label: "2º semestre" },
  { value: "ano", label: "Ano inteiro" },
];

export function mesesDoPeriodoFiltro(periodo: PeriodoFiltro, mesAtual: number): number[] {
  switch (periodo) {
    case "tri1":
      return [0, 1, 2];
    case "tri2":
      return [3, 4, 5];
    case "tri3":
      return [6, 7, 8];
    case "tri4":
      return [9, 10, 11];
    case "sem1":
      return [0, 1, 2, 3, 4, 5];
    case "sem2":
      return [6, 7, 8, 9, 10, 11];
    case "ano":
      return Array.from({ length: 12 }, (_, i) => i);
    case "mes_atual":
    default:
      return [mesAtual];
  }
}

export function periodoFiltroLabel(periodo: PeriodoFiltro, mesAtual: number) {
  if (periodo === "mes_atual") return meses[mesAtual] ?? "Mês selecionado";
  return periodosFiltro.find((item) => item.value === periodo)?.label ?? "Período";
}

export function filtrarLancamentosPorMeses<T extends Pick<Lancamento, "competencia">>(
  lancamentos: T[],
  mesesVisiveis: number[],
) {
  const mesesPermitidos = new Set(mesesVisiveis);
  return lancamentos.filter((lancamento) =>
    mesesPermitidos.has(mesDaCompetencia(lancamento.competencia)),
  );
}

export function totalizarResultadosPeriodo(
  resultados: ResultadoMes[],
  mesesVisiveis: number[],
): ResultadoMes {
  const total = mesesVisiveis
    .map((mes) => resultados[mes])
    .filter((resultado): resultado is ResultadoMes => Boolean(resultado))
    .reduce(
      (acc, m) => ({
        ...acc,
        receitaBruta: acc.receitaBruta + m.receitaBruta,
        deducoes: acc.deducoes + m.deducoes,
        receitaLiquida: acc.receitaLiquida + m.receitaLiquida,
        custos: acc.custos + m.custos,
        resultadoBruto: acc.resultadoBruto + m.resultadoBruto,
        despesas: acc.despesas + m.despesas,
        resultadoOperacional: acc.resultadoOperacional + m.resultadoOperacional,
        financeiro: acc.financeiro + m.financeiro,
        resultadoOpFin: acc.resultadoOpFin + m.resultadoOpFin,
        naoOperacional: acc.naoOperacional + m.naoOperacional,
        aportesEmprestimos: acc.aportesEmprestimos + m.aportesEmprestimos,
        resultadoLiquido: acc.resultadoLiquido + m.resultadoLiquido,
        temMovimento: acc.temMovimento || m.temMovimento,
      }),
      {
        mes: mesesVisiveis[0] ?? 0,
        receitaBruta: 0,
        deducoes: 0,
        receitaLiquida: 0,
        custos: 0,
        resultadoBruto: 0,
        despesas: 0,
        resultadoOperacional: 0,
        financeiro: 0,
        resultadoOpFin: 0,
        naoOperacional: 0,
        aportesEmprestimos: 0,
        resultadoLiquido: 0,
        margemBruta: 0,
        margemOperacional: 0,
        margemLiquida: 0,
        temMovimento: false,
      },
    );

  total.margemBruta = total.receitaBruta ? (total.resultadoBruto / total.receitaBruta) * 100 : 0;
  total.margemOperacional = total.receitaBruta
    ? (total.resultadoOperacional / total.receitaBruta) * 100
    : 0;
  total.margemLiquida = total.receitaBruta
    ? (total.resultadoLiquido / total.receitaBruta) * 100
    : 0;
  return total;
}
