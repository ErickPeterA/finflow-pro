import {
  agregarPorCategoria,
  grupoLabels,
  type Categoria,
  type Lancamento,
  type ResultadoMes,
  mediaFechados,
} from "./dre";
import { brl, pct } from "./format";

export interface Impacto {
  nome: string;
  grupo: string;
  delta: number;
  /** efeito no resultado operacional (positivo = melhora) */
  efeito: number;
}

export function calcularImpactos(
  lancamentos: Lancamento[],
  categorias: Categoria[],
  mes: number,
): { positivos: Impacto[]; negativos: Impacto[]; explicado: number; liquido: number } {
  const linhas = agregarPorCategoria(lancamentos, categorias);
  const impactos: Impacto[] = [];

  for (const l of linhas) {
    if (l.grupo === "financeiro" || l.grupo === "nao_operacional") continue;
    const atual = l.valores[mes] ?? 0;
    const anterior = mes > 0 ? (l.valores[mes - 1] ?? 0) : 0;
    const delta = atual - anterior;
    if (Math.abs(delta) < 0.01) continue;
    const receita = l.grupo === "receita_operacional";
    const efeito = receita ? delta : -delta;
    impactos.push({ nome: l.nome, grupo: grupoLabels[l.grupo], delta, efeito });
  }

  const positivos = impactos.filter((i) => i.efeito > 0).sort((a, b) => b.efeito - a.efeito);
  const negativos = impactos.filter((i) => i.efeito < 0).sort((a, b) => a.efeito - b.efeito);
  const liquido = impactos.reduce((s, i) => s + i.efeito, 0);
  const top = [...positivos.slice(0, 5), ...negativos.slice(0, 5)].reduce(
    (s, i) => s + Math.abs(i.efeito),
    0,
  );
  const total = impactos.reduce((s, i) => s + Math.abs(i.efeito), 0);
  const explicado = total ? (top / total) * 100 : 0;

  return { positivos, negativos, explicado, liquido };
}

export type NivelAlerta = "positivo" | "negativo" | "atencao" | "neutro";

export interface Alerta {
  titulo: string;
  detalhe: string;
  nivel: NivelAlerta;
}

export function gerarAlertas(
  resultados: ResultadoMes[],
  lancamentos: Lancamento[],
  categorias: Categoria[],
  mes: number,
  metaReceita?: number,
  margemDesejada = 15,
): Alerta[] {
  const atual = resultados[mes];
  const anterior = mes > 0 ? resultados[mes - 1] : undefined;
  const alertas: Alerta[] = [];
  if (!atual) return alertas;

  if (atual.resultadoOperacional < 0) {
    alertas.push({
      titulo: "Resultado operacional negativo",
      detalhe: `A operação consumiu ${brl(Math.abs(atual.resultadoOperacional))} no mês.`,
      nivel: "negativo",
    });
  }

  if (
    atual.resultadoLiquido > 0 &&
    atual.resultadoOperacional <= 0 &&
    atual.aportesEmprestimos > 0
  ) {
    alertas.push({
      titulo: "Resultado líquido sustentado por aporte ou empréstimo",
      detalhe: `${brl(atual.aportesEmprestimos)} entraram por aporte/empréstimo e não representam geração operacional.`,
      nivel: "negativo",
    });
  }

  if (anterior && anterior.receitaBruta > 0) {
    const varReceita = ((atual.receitaBruta - anterior.receitaBruta) / anterior.receitaBruta) * 100;
    alertas.push({
      titulo: varReceita >= 0 ? "Receita cresceu" : "Receita caiu",
      detalhe: `${pct(Math.abs(varReceita))} em relação ao mês anterior (${brl(atual.receitaBruta)}).`,
      nivel: varReceita >= 0 ? "positivo" : "negativo",
    });
  }

  const mediaOp = mediaFechados(resultados, (m) => m.resultadoOperacional);
  if (mediaOp !== 0) {
    const acima = atual.resultadoOperacional >= mediaOp;
    alertas.push({
      titulo: acima
        ? "Resultado operacional acima da média"
        : "Resultado operacional abaixo da média",
      detalhe: `Média dos meses fechados: ${brl(mediaOp)}.`,
      nivel: acima ? "positivo" : "atencao",
    });
  }

  if (atual.margemOperacional < margemDesejada && atual.receitaBruta > 0) {
    alertas.push({
      titulo: "Margem operacional abaixo da desejada",
      detalhe: `Realizado ${pct(atual.margemOperacional)} contra meta de ${pct(margemDesejada)}.`,
      nivel: "atencao",
    });
  }

  if (metaReceita && metaReceita > 0 && atual.receitaBruta < metaReceita) {
    alertas.push({
      titulo: "Receita abaixo da meta",
      detalhe: `Faltaram ${brl(metaReceita - atual.receitaBruta)} para atingir a meta do mês.`,
      nivel: "negativo",
    });
  }

  // categorias acima da média
  const linhas = agregarPorCategoria(lancamentos, categorias);
  for (const l of linhas) {
    if (l.grupo !== "custos" && l.grupo !== "despesas") continue;
    const valores = l.valores.slice(0, mes).filter((v) => v > 0);
    if (valores.length < 2) continue;
    const media = valores.reduce((s, v) => s + v, 0) / valores.length;
    const valor = l.valores[mes] ?? 0;
    if (media > 0 && valor > media * 1.2) {
      alertas.push({
        titulo: `${l.nome} acima da média`,
        detalhe: `${brl(valor)} no mês contra média de ${brl(media)}.`,
        nivel: "atencao",
      });
    }
  }

  // concentração de receita
  const receitas = linhas.filter((l) => l.grupo === "receita_operacional");
  const totalReceita = receitas.reduce((s, l) => s + (l.valores[mes] ?? 0), 0);
  const maior = receitas.sort((a, b) => (b.valores[mes] ?? 0) - (a.valores[mes] ?? 0))[0];
  if (maior && totalReceita > 0) {
    const part = ((maior.valores[mes] ?? 0) / totalReceita) * 100;
    if (part > 60) {
      alertas.push({
        titulo: "Concentração excessiva de receita",
        detalhe: `${maior.nome} representa ${pct(part)} da receita do mês.`,
        nivel: "atencao",
      });
    }
  }

  return alertas.slice(0, 8);
}
