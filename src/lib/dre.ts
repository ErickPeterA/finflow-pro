import { mesesCurtos } from "./format";

export type GrupoDre =
  "receita_operacional" | "deducoes" | "custos" | "despesas" | "financeiro" | "nao_operacional";

export type Tratamento =
  | "operacional"
  | "transferencia"
  | "emprestimo"
  | "aporte"
  | "resgate"
  | "aplicacao"
  | "investimento"
  | "compra_ativo"
  | "reembolso"
  | "estorno"
  | "juros"
  | "multa"
  | "tarifa"
  | "receita_financeira";

export const tratamentoLabels: Record<Tratamento, string> = {
  operacional: "Operacional",
  transferencia: "Transferência entre contas",
  emprestimo: "Empréstimo",
  aporte: "Aporte de sócios",
  resgate: "Resgate",
  aplicacao: "Aplicação",
  investimento: "Investimento",
  compra_ativo: "Compra de ativo",
  reembolso: "Reembolso",
  estorno: "Estorno",
  juros: "Juros",
  multa: "Multa",
  tarifa: "Tarifa",
  receita_financeira: "Receita financeira",
};

export const grupoLabels: Record<GrupoDre, string> = {
  receita_operacional: "Receita Operacional",
  deducoes: "Dedução da Receita Bruta",
  custos: "Custos Operacionais",
  despesas: "Despesas Operacionais",
  financeiro: "Atividade de Investimento",
  nao_operacional: "Atividade de Financiamento",
};

export const FINANCEIRO_TRATAMENTOS: Tratamento[] = [
  "juros",
  "multa",
  "tarifa",
  "receita_financeira",
];

export const NAO_OPERACIONAL_TRATAMENTOS: Tratamento[] = [
  "transferencia",
  "emprestimo",
  "aporte",
  "resgate",
  "aplicacao",
  "investimento",
  "compra_ativo",
];

export interface Categoria {
  id: string;
  empresa_id: string;
  grupo: GrupoDre;
  nome: string;
  classificacao: "fixo" | "variavel";
  recorrente: boolean;
  ordem: number;
  ativo: boolean;
}

export interface Lancamento {
  id: string;
  empresa_id: string;
  tipo: "recebida" | "paga";
  data_efetiva: string;
  competencia: string;
  descricao: string;
  categoria_nibo: string | null;
  categoria_id: string | null;
  pessoa: string | null;
  centro_custo: string | null;
  conta_bancaria: string | null;
  valor: number;
  hash: string;
  origem?: string;
  external_source?: string | null;
  external_id?: string | null;
  tratamento: Tratamento;
  nao_recorrente: boolean;
}

/** Grupo efetivo do lançamento, respeitando os tratamentos obrigatórios. */
export function grupoDoLancamento(l: Lancamento, categorias: Categoria[]): GrupoDre {
  if (NAO_OPERACIONAL_TRATAMENTOS.includes(l.tratamento)) return "nao_operacional";
  if (FINANCEIRO_TRATAMENTOS.includes(l.tratamento)) return "financeiro";
  const cat = categorias.find((c) => c.id === l.categoria_id);
  const grupoCodigo = grupoPorPrefixo(prefixoCategoria(l.categoria_nibo, cat?.nome));
  if (grupoCodigo) return grupoCodigo;
  if (cat) return cat.grupo;
  return l.tipo === "recebida" ? "receita_operacional" : "despesas";
}

export function nomeCategoria(l: Lancamento, categorias: Categoria[]): string {
  const cat = categorias.find((c) => c.id === l.categoria_id);
  if (cat) return cat.nome;
  return l.categoria_nibo?.trim() || "Não classificado";
}

function prefixoCategoria(...valores: Array<string | null | undefined>): string | null {
  for (const valor of valores) {
    const texto = String(valor ?? "").trim();
    const prefixo = texto.match(/^(\d+)(?:[.\-\s]|$)/)?.[1];
    if (prefixo) return prefixo;
  }
  return null;
}

function grupoPorPrefixo(prefixo: string | null): GrupoDre | null {
  if (!prefixo) return null;
  if (prefixo.startsWith("1")) return "receita_operacional";
  if (prefixo.startsWith("2")) return "custos";
  if (prefixo.startsWith("3")) return "despesas";
  if (prefixo.startsWith("4")) return "financeiro";
  if (prefixo.startsWith("5")) return "nao_operacional";
  return null;
}

/** Valor com sinal para composição do resultado: o sinal vem da planilha/importação. */
export function valorAssinado(_grupo: GrupoDre, l: Lancamento): number {
  return Number(l.valor) || 0;
}

export interface ResultadoMes {
  mes: number;
  receitaBruta: number;
  deducoes: number;
  receitaLiquida: number;
  custos: number;
  resultadoBruto: number;
  despesas: number;
  resultadoOperacional: number;
  financeiro: number;
  resultadoOpFin: number;
  naoOperacional: number;
  aportesEmprestimos: number;
  resultadoLiquido: number;
  margemBruta: number;
  margemOperacional: number;
  margemLiquida: number;
  temMovimento: boolean;
}

const vazio = (mes: number): ResultadoMes => ({
  mes,
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
});

export function mesDaCompetencia(competencia: unknown): number {
  // Dados importados podem chegar de fontes que serializam datas como objetos.
  // A conversão mantém o cálculo atual para strings ISO e torna registros
  // inválidos apenas inelegíveis para o agrupamento, sem interromper a tela.
  const texto =
    typeof competencia === "string"
      ? competencia
      : competencia instanceof Date
        ? competencia.toISOString().slice(0, 10)
        : "";
  return Number(texto.slice(5, 7)) - 1;
}

/** Calcula o DRE gerencial (regime de caixa) para os 12 meses do ano. */
export function calcularDre(lancamentos: Lancamento[], categorias: Categoria[]): ResultadoMes[] {
  const meses = Array.from({ length: 12 }, (_, i) => vazio(i));

  for (const l of lancamentos) {
    const idx = mesDaCompetencia(l.competencia);
    if (idx < 0 || idx > 11) continue;
    const m = meses[idx];
    if (!m) continue;
    const grupo = grupoDoLancamento(l, categorias);
    const v = valorAssinado(grupo, l);
    m.temMovimento = true;
    switch (grupo) {
      case "receita_operacional":
        m.receitaBruta += v;
        break;
      case "deducoes":
        m.deducoes += -v;
        break;
      case "custos":
        m.custos += -v;
        break;
      case "despesas":
        m.despesas += -v;
        break;
      case "financeiro":
        m.financeiro += v;
        break;
      case "nao_operacional":
        m.naoOperacional += v;
        if (l.tratamento === "aporte" || l.tratamento === "emprestimo") {
          m.aportesEmprestimos += v;
        }
        break;
    }
  }

  for (const m of meses) {
    const receitaBase = m.receitaBruta;
    m.receitaLiquida = m.receitaBruta - m.deducoes;
    m.resultadoBruto = m.receitaLiquida - m.custos;
    m.resultadoOperacional = m.resultadoBruto - m.despesas;
    m.resultadoOpFin = m.resultadoOperacional + m.financeiro;
    m.resultadoLiquido = m.resultadoOpFin + m.naoOperacional;
    m.margemBruta = receitaBase ? (m.resultadoBruto / receitaBase) * 100 : 0;
    m.margemOperacional = receitaBase ? (m.resultadoOperacional / receitaBase) * 100 : 0;
    m.margemLiquida = receitaBase ? (m.resultadoLiquido / receitaBase) * 100 : 0;
  }

  return meses;
}

/** Média considerando apenas meses efetivamente fechados (com movimento). */
export function mediaFechados(
  resultados: ResultadoMes[],
  pick: (m: ResultadoMes) => number,
  ateMes?: number,
): number {
  const base = resultados.filter(
    (m) => m.temMovimento && (ateMes === undefined || m.mes <= ateMes),
  );
  if (!base.length) return 0;
  return base.reduce((s, m) => s + pick(m), 0) / base.length;
}

export function acumulado(
  resultados: ResultadoMes[],
  pick: (m: ResultadoMes) => number,
  ateMes: number,
): number {
  return resultados.filter((m) => m.mes <= ateMes).reduce((s, m) => s + pick(m), 0);
}

export interface LinhaCategoria {
  categoriaId: string | null;
  nome: string;
  grupo: GrupoDre;
  classificacao: "fixo" | "variavel";
  recorrente: boolean;
  valores: number[];
}

export interface LinhaCentroCategoria extends LinhaCategoria {
  centroCusto: string;
}

/** Agrega valores absolutos por categoria e mês, dentro de um grupo. */
export function agregarPorCategoria(
  lancamentos: Lancamento[],
  categorias: Categoria[],
): LinhaCategoria[] {
  const mapa = new Map<string, LinhaCategoria>();
  for (const l of lancamentos) {
    const grupo = grupoDoLancamento(l, categorias);
    const cat = categorias.find((c) => c.id === l.categoria_id);
    const nome = nomeCategoria(l, categorias);
    const key = `${grupo}::${nome}`;
    if (!mapa.has(key)) {
      mapa.set(key, {
        categoriaId: cat?.id ?? null,
        nome,
        grupo,
        classificacao: cat?.classificacao ?? "variavel",
        recorrente: cat ? cat.recorrente : !l.nao_recorrente,
        valores: Array(12).fill(0),
      });
    }
    const linha = mapa.get(key)!;
    const idx = mesDaCompetencia(l.competencia);
    if (idx >= 0 && idx < 12) {
      linha.valores[idx] = (linha.valores[idx] ?? 0) + valorAssinado(grupo, l);
    }
  }
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function agregarPorCentroCategoria(
  lancamentos: Lancamento[],
  categorias: Categoria[],
): LinhaCentroCategoria[] {
  const mapa = new Map<string, LinhaCentroCategoria>();
  for (const l of lancamentos) {
    const grupo = grupoDoLancamento(l, categorias);
    const cat = categorias.find((c) => c.id === l.categoria_id);
    const nome = nomeCategoria(l, categorias);
    const centroCusto = l.centro_custo?.trim() || "Sem centro de custo";
    const key = `${grupo}::${centroCusto}::${nome}`;
    if (!mapa.has(key)) {
      mapa.set(key, {
        categoriaId: cat?.id ?? null,
        nome,
        grupo,
        centroCusto,
        classificacao: cat?.classificacao ?? "variavel",
        recorrente: cat ? cat.recorrente : !l.nao_recorrente,
        valores: Array(12).fill(0),
      });
    }
    const linha = mapa.get(key)!;
    const idx = mesDaCompetencia(l.competencia);
    if (idx >= 0 && idx < 12) {
      linha.valores[idx] = (linha.valores[idx] ?? 0) + valorAssinado(grupo, l);
    }
  }
  return [...mapa.values()].sort((a, b) => {
    const centro = a.centroCusto.localeCompare(b.centroCusto, "pt-BR");
    if (centro !== 0) return centro;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

export function serieMensal(resultados: ResultadoMes[], ateMes: number) {
  return resultados
    .filter((m) => m.mes <= ateMes)
    .map((m) => ({
      mes: mesesCurtos[m.mes],
      receita: m.receitaBruta,
      receitaLiquida: m.receitaLiquida,
      custos: m.custos,
      despesas: m.despesas,
      resultadoOperacional: m.resultadoOperacional,
      resultadoLiquido: m.resultadoLiquido,
      margemOperacional: Number(m.margemOperacional.toFixed(1)),
      margemLiquida: Number(m.margemLiquida.toFixed(1)),
    }));
}

export type Qualidade = "saudavel" | "atencao" | "critico" | "extraordinario";

export function qualidadeResultado(
  m: ResultadoMes,
  margemDesejada = 15,
): {
  nivel: Qualidade;
  texto: string;
} {
  if (m.resultadoOperacional <= 0 && m.resultadoLiquido > 0 && m.aportesEmprestimos > 0) {
    return {
      nivel: "critico",
      texto: "Resultado líquido sustentado por aporte ou empréstimo",
    };
  }
  if (m.resultadoOperacional < 0) {
    return { nivel: "critico", texto: "Resultado operacional negativo" };
  }
  if (m.margemOperacional >= margemDesejada * 1.5) {
    return { nivel: "extraordinario", texto: "Margem operacional muito acima da meta" };
  }
  if (m.margemOperacional >= margemDesejada) {
    return { nivel: "saudavel", texto: "Operação dentro da margem desejada" };
  }
  return { nivel: "atencao", texto: "Margem operacional abaixo da desejada" };
}
