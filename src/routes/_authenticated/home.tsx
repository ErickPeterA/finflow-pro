import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowRight,
  BadgeDollarSign,
  CircleDollarSign,
  Minus,
  Plus,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Bloco, Kpi, SemDados, SemEmpresa, type Tom } from "@/components/ui-blocos";
import { useApp } from "@/lib/app-context";
import { filtrarLancamentosPorCentroCusto } from "@/lib/centro-custo";
import { useCategorias, useConfiguracao, useEmpresaAtual, useLancamentos } from "@/lib/data";
import {
  agregarPorCategoria,
  calcularDre,
  calcularDreHartwig,
  mesDaCompetencia,
  qualidadeResultado,
  type Categoria,
  type Lancamento,
} from "@/lib/dre";
import {
  mesesDoPeriodoFiltro,
  periodoFiltroLabel,
  totalizarResultadosPeriodo,
} from "@/lib/periodo";
import { brl, pct, variacao } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Home Executiva | Ecossistema Financeiro BPO" },
      {
        name: "description",
        content: "Visão executiva do mês: indicadores, caminho do resultado e principais impactos.",
      },
      { property: "og:title", content: "Home Executiva | Ecossistema Financeiro BPO" },
      {
        property: "og:description",
        content: "Resultado do mês do cliente em uma leitura clara e direta.",
      },
    ],
  }),
  component: HomePage,
});

const qualidadeEstilo: Record<string, { classe: string; rotulo: string }> = {
  saudavel: { classe: "bg-positive-soft text-positive", rotulo: "Saudável" },
  atencao: { classe: "bg-warning-soft text-warning", rotulo: "Atenção" },
  critico: { classe: "bg-negative-soft text-negative", rotulo: "Crítico" },
  extraordinario: { classe: "bg-extra-soft text-extra", rotulo: "Extraordinário" },
};

const coresGraficoHome = {
  receita: { inicio: "#2563eb", fim: "#2563eb" },
  custos: { inicio: "#2563eb", fim: "#2563eb" },
  despesas: { inicio: "#2563eb", fim: "#2563eb" },
  resultadoPositivo: { inicio: "#2563eb", fim: "#2563eb" },
  resultadoNegativo: { inicio: "#2563eb", fim: "#2563eb" },
};

function HomePage() {
  const { empresaId, ano, mes, periodo, centroCusto } = useApp();
  const { data: empresa } = useEmpresaAtual(empresaId);
  const { data: lancamentos = [], isLoading } = useLancamentos(empresaId, ano);
  const { data: categorias = [] } = useCategorias(empresaId);
  const { data: config } = useConfiguracao(empresaId);

  const margemDesejada = Number(config?.margem_desejada ?? 15);
  const dreHartwig = normalizarNomeEmpresa(empresa?.nome).includes("hartwig");

  const lancamentosFiltrados = useMemo(
    () => filtrarLancamentosPorCentroCusto(lancamentos, centroCusto),
    [lancamentos, centroCusto],
  );
  const resultados = useMemo(
    () =>
      dreHartwig
        ? calcularDreHartwig(lancamentosFiltrados, categorias)
        : calcularDre(lancamentosFiltrados, categorias),
    [lancamentosFiltrados, categorias, dreHartwig],
  );
  const mesesPeriodo = useMemo(() => mesesDoPeriodoFiltro(periodo, mes), [periodo, mes]);
  const atual = useMemo(
    () => totalizarResultadosPeriodo(resultados, mesesPeriodo),
    [resultados, mesesPeriodo],
  );
  const anterior = periodo === "mes_atual" && mes > 0 ? resultados[mes - 1] : undefined;
  const custosOperacionais = atual.deducoes + atual.custos;
  const colaboradoresPeriodo = dreHartwig ? mediaColaboradoresHartwig(ano, mesesPeriodo) : 0;
  const resultadoOpPorColaborador = colaboradoresPeriodo
    ? atual.resultadoOperacional / colaboradoresPeriodo
    : 0;
  const colaboradoresAnterior =
    dreHartwig && mes > 0 ? mediaColaboradoresHartwig(ano, [mes - 1]) : 0;
  const resultadoOpPorColaboradorAnterior =
    anterior && colaboradoresAnterior
      ? anterior.resultadoOperacional / colaboradoresAnterior
      : undefined;

  const caminhoGastos = useMemo(
    () =>
      calcularCaminhoGastos(
        lancamentosFiltrados,
        categorias,
        mesesPeriodo,
        custosOperacionais,
        atual.despesas,
      ),
    [lancamentosFiltrados, categorias, mesesPeriodo, custosOperacionais, atual.despesas],
  );
  const periodoLabel = periodoFiltroLabel(periodo, mes);
  const insights = useMemo(
    () =>
      criarInsightsAutomaticos({
        atual,
        anterior,
        lancamentos: lancamentosFiltrados,
        categorias,
        mesesPeriodo,
      }),
    [atual, anterior, lancamentosFiltrados, categorias, mesesPeriodo],
  );

  const qualidade = qualidadeResultado(atual, margemDesejada);
  const estilo = qualidadeEstilo[qualidade.nivel]!;
  const scoreQualidade = Math.max(
    0,
    Math.min(100, Math.round((atual.margemOperacional / Math.max(margemDesejada * 1.5, 1)) * 100)),
  );
  const grafico = [
    { nome: "Receita", valor: atual.receitaBruta },
    { nome: "Custos Op.", valor: custosOperacionais },
    { nome: "Despesas Op.", valor: atual.despesas },
    {
      nome: "Resultado Op.",
      valor: atual.resultadoOperacional,
    },
  ];

  const tom = (v: number): Tom => (v > 0 ? "positivo" : v < 0 ? "negativo" : "neutro");
  const tituloKpi = (titulo: string, tituloMensal = titulo) =>
    periodo === "ano"
      ? `${titulo} anual`
      : periodo === "mes_atual"
        ? tituloMensal
        : `${titulo} do período`;

  return (
    <>
      <TopBar
        titulo="Home"
        descricao={`${empresa?.nome ?? "Selecione uma empresa"} · ${periodoLabel} de ${ano}`}
      />
      <main className="space-y-5 p-6 ">
        {!empresaId ? (
          <SemEmpresa />
        ) : isLoading ? (
          <SemDados mensagem="Carregando dados do período..." />
        ) : !atual.temMovimento ? (
          <SemDados mensagem="Nenhum lançamento importado para este mês. Comece pela tela de Importação NIBO." />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 ">
              <Kpi
                titulo={tituloKpi("Receita", "Receita do mês")}
                valor={atual.receitaBruta}
                variacaoPct={variacao(atual.receitaBruta, anterior?.receitaBruta ?? 0)}
                anterior={anterior?.receitaBruta}
                tom="neutro"
                mostrarSemBase={false}
              />
              <Kpi
                titulo={tituloKpi("Resultado Bruto")}
                valor={atual.resultadoBruto}
                variacaoPct={variacao(atual.resultadoBruto, anterior?.resultadoBruto ?? 0)}
                anterior={anterior?.resultadoBruto}
                tom={tom(atual.resultadoBruto)}
                mostrarSemBase={false}
              />
              <Kpi
                titulo={tituloKpi("Resultado Operacional")}
                valor={atual.resultadoOperacional}
                variacaoPct={variacao(
                  atual.resultadoOperacional,
                  anterior?.resultadoOperacional ?? 0,
                )}
                anterior={anterior?.resultadoOperacional}
                tom={tom(atual.resultadoOperacional)}
                mostrarSemBase={false}
              />
              <Kpi
                titulo={tituloKpi("Resultado OP + Financeiro")}
                valor={atual.resultadoOpFin}
                variacaoPct={variacao(atual.resultadoOpFin, anterior?.resultadoOpFin ?? 0)}
                anterior={anterior?.resultadoOpFin}
                tom={tom(atual.resultadoOpFin)}
                mostrarSemBase={false}
              />
              <Kpi
                titulo={tituloKpi("Resultado Líquido")}
                valor={atual.resultadoLiquido}
                variacaoPct={variacao(atual.resultadoLiquido, anterior?.resultadoLiquido ?? 0)}
                anterior={anterior?.resultadoLiquido}
                tom={tom(atual.resultadoLiquido)}
                mostrarSemBase={false}
              />
              {dreHartwig && (
                <>
                  <Kpi
                    titulo={tituloKpi("Resultado Líquido c/ Distrib")}
                    valor={atual.resultadoLiquidoComDistrib}
                    variacaoPct={variacao(
                      atual.resultadoLiquidoComDistrib,
                      anterior?.resultadoLiquidoComDistrib ?? 0,
                    )}
                    anterior={anterior?.resultadoLiquidoComDistrib}
                    tom={tom(atual.resultadoLiquidoComDistrib)}
                    mostrarSemBase={false}
                  />
                  <Kpi
                    titulo={tituloKpi("Resultado Operacional - Cotistas")}
                    valor={atual.resultadoOperacionalCotistas}
                    variacaoPct={variacao(
                      atual.resultadoOperacionalCotistas,
                      anterior?.resultadoOperacionalCotistas ?? 0,
                    )}
                    anterior={anterior?.resultadoOperacionalCotistas}
                    tom={tom(atual.resultadoOperacionalCotistas)}
                    mostrarSemBase={false}
                  />
                  <Kpi
                    titulo={tituloKpi("Resultado OP. p/ colaborador")}
                    valor={resultadoOpPorColaborador}
                    variacaoPct={variacao(
                      resultadoOpPorColaborador,
                      resultadoOpPorColaboradorAnterior ?? 0,
                    )}
                    anterior={resultadoOpPorColaboradorAnterior}
                    tom={tom(resultadoOpPorColaborador)}
                    legenda={`${colaboradoresPeriodo.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} colaboradores no período`}
                    mostrarSemBase={false}
                  />
                </>
              )}
            </div>

            <Bloco
              titulo="Caminho dos gastos"
              acoes={
                <span className="text-xs text-muted-foreground">
                  Custos + despesas operacionais
                </span>
              }
            >
              <div className="flex flex-wrap items-stretch gap-2 ">
                <Etapa
                  rotulo="Custos operacionais"
                  valor={caminhoGastos.custosOperacionais}
                  tom="negativo"
                  destaque
                />
                <Operador icone="igual" />
                <Etapa
                  rotulo="Dedução de receita"
                  valor={caminhoGastos.deducaoReceita}
                  tom="negativo"
                />
                <Operador icone="mais" />
                <Etapa rotulo="Custos diretos" valor={caminhoGastos.custosDiretos} tom="negativo" />
                <Operador icone="mais" />
                <Etapa
                  rotulo="Custos indiretos"
                  valor={caminhoGastos.custosIndiretos}
                  tom="negativo"
                />
                <Operador icone="mais" />
                <Etapa
                  rotulo="Comissionamento"
                  valor={caminhoGastos.comissionamento}
                  tom="negativo"
                />
                <Operador icone="mais" />
                <Etapa
                  rotulo="Custos pessoais"
                  valor={caminhoGastos.custosPessoais}
                  tom="negativo"
                />
                <Operador icone="mais" />
                <Etapa
                  rotulo="Custos de marketing"
                  valor={caminhoGastos.custosMarketing}
                  tom="negativo"
                />
                <Operador icone="mais" />
                <Etapa
                  rotulo="Despesas operacionais"
                  valor={caminhoGastos.despesasOperacionais}
                  tom="negativo"
                />
                <Operador icone="igual" />
                <Etapa
                  rotulo="Total de gastos"
                  valor={caminhoGastos.totalGastos}
                  tom="negativo"
                  destaque
                />
              </div>
            </Bloco>

            <div className="grid gap-5 xl:grid-cols-3">
              <Bloco
                titulo="Visão geral do mês"
                className="xl:col-span-2"
                acoes={
                  <span className="text-xs text-muted-foreground">
                    Margem operacional {pct(atual.margemOperacional)}
                  </span>
                }
              >
                <div className="h-72 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={grafico} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="grafico-receita" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor={coresGraficoHome.receita.inicio} />
                          <stop offset="100%" stopColor={coresGraficoHome.receita.fim} />
                        </linearGradient>
                        <linearGradient id="grafico-custos" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor={coresGraficoHome.custos.inicio} />
                          <stop offset="100%" stopColor={coresGraficoHome.custos.fim} />
                        </linearGradient>
                        <linearGradient id="grafico-despesas" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor={coresGraficoHome.despesas.inicio} />
                          <stop offset="100%" stopColor={coresGraficoHome.despesas.fim} />
                        </linearGradient>
                        <linearGradient id="grafico-resultado" x1="0" x2="0" y1="0" y2="1">
                          <stop
                            offset="0%"
                            stopColor={
                              atual.resultadoOperacional >= 0
                                ? coresGraficoHome.resultadoPositivo.inicio
                                : coresGraficoHome.resultadoNegativo.inicio
                            }
                          />
                          <stop
                            offset="100%"
                            stopColor={
                              atual.resultadoOperacional >= 0
                                ? coresGraficoHome.resultadoPositivo.fim
                                : coresGraficoHome.resultadoNegativo.fim
                            }
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="var(--border)"
                      />
                      <XAxis dataKey="nome" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis
                        tickFormatter={(v) => brl(Number(v), true)}
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        width={76}
                      />
                      <Tooltip
                        formatter={(v) => brl(Number(v))}
                        contentStyle={{
                          borderRadius: 10,
                          border: "1px solid var(--border)",
                          background: "var(--card)",
                          boxShadow: "var(--shadow-card)",
                        }}
                      />
                      <Bar dataKey="valor" radius={[8, 8, 0, 0]} barSize={42}>
                        <LabelList
                          dataKey="valor"
                          position="top"
                          formatter={(v: number) => brl(Number(v), true)}
                          fontSize={11}
                          fill="var(--foreground)"
                        />
                        {grafico.map((g) => (
                          <Cell
                            key={g.nome}
                            fill={
                              g.nome === "Receita"
                                ? "url(#grafico-receita)"
                                : g.nome === "Custos Op."
                                  ? "url(#grafico-custos)"
                                  : g.nome === "Despesas Op."
                                    ? "url(#grafico-despesas)"
                                    : "url(#grafico-resultado)"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Bloco>

              <Bloco
                titulo="Qualidade do resultado"
                acoes={
                  <span
                    className={cn(
                      "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                      estilo.classe,
                    )}
                  >
                    {estilo.rotulo}
                  </span>
                }
              >
                <div className="flex flex-col items-center gap-4 text-center">
                  <div
                    className="grid size-32 place-items-center rounded-full p-2"
                    style={{
                      background: `conic-gradient(var(--positive) ${scoreQualidade}%, var(--muted) 0)`,
                    }}
                  >
                    <div className="grid size-full place-items-center rounded-full bg-card">
                      <div>
                        <p className="tabular text-2xl font-semibold">
                          {pct(atual.margemOperacional, 0)}
                        </p>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          margem
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{qualidade.texto}</p>
                </div>

                <dl className="mt-5 space-y-2 border-t pt-4 text-sm">
                  <LinhaDiagnostico
                    icone={Activity}
                    rotulo="Operação"
                    valor={atual.resultadoOperacional}
                  />
                  <LinhaDiagnostico
                    icone={TrendingUp}
                    rotulo="Investimentos"
                    valor={atual.financeiro}
                  />
                  <LinhaDiagnostico
                    icone={ShieldCheck}
                    rotulo="Financiamento"
                    valor={atual.naoOperacional}
                  />
                </dl>
              </Bloco>
            </div>

            <Bloco
              titulo="Leitura de receitas e gastos"
              acoes={
                <span className="text-xs text-muted-foreground">
                  {periodoLabel} de {ano}
                </span>
              }
            >
              <div className="overflow-hidden rounded-xl border bg-secondary/40">
                <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Resumo do período
                      </p>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                          insights.resumo.saldo >= 0
                            ? "bg-positive-soft text-positive"
                            : "bg-negative-soft text-negative",
                        )}
                      >
                        {insights.resumo.saldo >= 0 ? "Saldo positivo" : "Saldo negativo"}
                      </span>
                    </div>
                    <h3 className="mt-3 text-xl font-semibold tracking-tight">
                      {insights.resumo.titulo}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {insights.resumo.texto}
                    </p>
                  </div>

                  <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-3">
                    <ResumoMetrica
                      icone={TrendingUp}
                      rotulo="Receita bruta"
                      valor={insights.resumo.receita}
                      tom="neutro"
                    />
                    <ResumoMetrica
                      icone={WalletCards}
                      rotulo="Custos + despesas"
                      valor={insights.resumo.gastos}
                      tom="atencao"
                    />
                    <ResumoMetrica
                      icone={CircleDollarSign}
                      rotulo="Saldo operacional"
                      valor={insights.resumo.saldo}
                      tom={insights.resumo.saldo >= 0 ? "positivo" : "negativo"}
                    />
                  </div>
                </div>
                <div className="h-1 bg-muted">
                  <div
                    className={cn(
                      "h-full",
                      insights.resumo.saldo >= 0 ? "bg-positive" : "bg-negative",
                    )}
                    style={{ width: `${insights.resumo.percentualConsumido}%` }}
                  />
                </div>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {insights.itens.map((insight) => (
                  <InsightCard key={insight.titulo} insight={insight} />
                ))}
              </div>
            </Bloco>
          </>
        )}
      </main>
    </>
  );
}

function calcularCaminhoGastos(
  lancamentos: Lancamento[],
  categorias: Categoria[],
  mesesVisiveis: number[],
  custosOperacionais: number,
  despesasOperacionais: number,
) {
  const mesesPermitidos = new Set(mesesVisiveis);
  const valorPorPrefixo = (prefixo: string, nomeContem?: string) =>
    lancamentos.reduce((total, lancamento) => {
      if (!mesesPermitidos.has(mesDaCompetencia(lancamento.competencia))) return total;
      const categoria = categorias.find((c) => c.id === lancamento.categoria_id);
      const textos = [lancamento.categoria_nibo, categoria?.nome]
        .filter(Boolean)
        .map((texto) => normalizarTexto(String(texto)));
      const temPrefixo = textos.some((texto) => textoComecaComPrefixo(texto, prefixo));
      const temNome = nomeContem
        ? textos.some((texto) => texto.includes(normalizarTexto(nomeContem)))
        : false;
      const pareceCustoOperacional =
        categoria?.grupo === "custos" || textos.some((texto) => textoComecaComPrefixo(texto, "2"));

      if (!temPrefixo && !(temNome && pareceCustoOperacional)) return total;
      return total + Math.abs(Number(lancamento.valor) || 0);
    }, 0);

  const deducaoReceita = valorPorPrefixo("2.1");
  const custosDiretos = valorPorPrefixo("2.2");
  const custosIndiretos = valorPorPrefixo("2.3");
  const comissionamento = valorPorPrefixo("2.4", "comissionamento");
  const custosPessoais = valorPorPrefixo("2.5", "pessoais");
  const custosMarketing = valorPorPrefixo("2.6", "marketing");

  return {
    custosOperacionais,
    deducaoReceita,
    custosDiretos,
    custosIndiretos,
    comissionamento,
    custosPessoais,
    custosMarketing,
    despesasOperacionais,
    totalGastos: custosOperacionais + despesasOperacionais,
  };
}

function normalizarTexto(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Base de colaboradores do DRE Hartwig 2026 enviado como referência.
// Anos anteriores usam a média anual registrada no mesmo demonstrativo.
const colaboradoresHartwig: Record<number, number[]> = {
  2023: Array(12).fill(5),
  2024: Array(12).fill(7),
  2025: Array(12).fill(8),
  2026: [8, 8, 8, 7, 8, 8, 7.5, 7.5, 7.5, 8, 8, 8],
};

function mediaColaboradoresHartwig(ano: number, mesesSelecionados: number[]) {
  const valoresAno = colaboradoresHartwig[ano];
  if (!valoresAno) return 0;
  const valores = mesesSelecionados.map((mesIndex) => valoresAno[mesIndex] ?? 0).filter(Boolean);
  return valores.length ? valores.reduce((total, valor) => total + valor, 0) / valores.length : 0;
}

function normalizarNomeEmpresa(nome?: string | null) {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function textoComecaComPrefixo(texto: string, prefixo: string) {
  const prefixoSeguro = prefixo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${prefixoSeguro}(?:[.\\-\\s]|$)`).test(texto);
}

function Etapa({
  rotulo,
  descricao,
  valor,
  tom,
  destaque,
}: {
  rotulo: string;
  descricao?: string;
  valor: number;
  tom: Tom;
  destaque?: boolean;
}) {
  const cores: Record<Tom, string> = {
    positivo: "text-positive",
    negativo: "text-negative",
    atencao: "text-warning",
    neutro: "text-info",
    extra: "text-extra",
  };
  return (
    <div
      className={cn(
        "min-w-36 flex-1 rounded-lg border px-4 py-3",
        destaque ? "border-transparent bg-secondary" : "bg-card",
      )}
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      {descricao && <p className="mt-1 text-xs text-muted-foreground">{descricao}</p>}
      <p className={cn("tabular mt-1 text-base font-semibold", cores[tom])}>{brl(valor)}</p>
    </div>
  );
}

function Operador({ icone }: { icone: "mais" | "menos" | "igual" }) {
  return (
    <div className="flex items-center px-1 text-muted-foreground">
      {icone === "mais" ? (
        <Plus className="h-4 w-4" />
      ) : icone === "menos" ? (
        <Minus className="h-4 w-4" />
      ) : (
        <ArrowRight className="h-4 w-4" />
      )}
    </div>
  );
}

function LinhaDiagnostico({
  icone: Icone,
  rotulo,
  valor,
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: number;
}) {
  const tomLinha = valor > 0 ? "positivo" : valor < 0 ? "negativo" : "neutro";
  const estilo = tomEstilo(tomLinha);

  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", estilo.soft)}>
          <Icone className="h-3.5 w-3.5" />
        </span>
        <span className="truncate">{rotulo}</span>
      </dt>
      <dd className={cn("tabular font-medium", estilo.texto)}>{brl(valor)}</dd>
    </div>
  );
}

function tomEstilo(tom: Tom) {
  const estilos: Record<Tom, { texto: string; soft: string; barra: string }> = {
    positivo: {
      texto: "text-positive",
      soft: "bg-positive-soft text-positive",
      barra: "bg-positive",
    },
    negativo: {
      texto: "text-negative",
      soft: "bg-negative-soft text-negative",
      barra: "bg-negative",
    },
    atencao: {
      texto: "text-warning",
      soft: "bg-warning-soft text-warning",
      barra: "bg-warning",
    },
    neutro: {
      texto: "text-info",
      soft: "bg-info-soft text-info",
      barra: "bg-info",
    },
    extra: {
      texto: "text-extra",
      soft: "bg-extra-soft text-extra",
      barra: "bg-extra",
    },
  };

  return estilos[tom];
}

type InsightAutomatico = {
  fonte: string;
  titulo: string;
  valor: string;
  texto: string;
  tom: Tom;
  progresso: number;
  icone: LucideIcon;
};

function criarInsightsAutomaticos({
  atual,
  anterior,
  lancamentos,
  categorias,
  mesesPeriodo,
}: {
  atual: ReturnType<typeof totalizarResultadosPeriodo>;
  anterior: ReturnType<typeof calcularDre>[number] | undefined;
  lancamentos: Lancamento[];
  categorias: Categoria[];
  mesesPeriodo: number[];
}) {
  const variacaoReceita = anterior ? variacao(atual.receitaBruta, anterior.receitaBruta) : null;
  const variacaoCustos = anterior ? variacao(atual.custos, anterior.custos) : null;
  const variacaoDespesas = anterior ? variacao(atual.despesas, anterior.despesas) : null;
  const linhas = agregarPorCategoria(lancamentos, categorias);
  const somarPeriodo = (valores: number[]) =>
    mesesPeriodo.reduce((total, mesIndex) => total + Math.abs(valores[mesIndex] ?? 0), 0);
  const principalCategoria = (grupo: "receita_operacional" | "custos" | "despesas") =>
    linhas
      .filter((linha) => linha.grupo === grupo)
      .map((linha) => ({ nome: linha.nome, valor: somarPeriodo(linha.valores) }))
      .sort((a, b) => b.valor - a.valor)[0];
  const principalReceita = principalCategoria("receita_operacional");
  const principalCusto = principalCategoria("custos");
  const principalDespesa = principalCategoria("despesas");
  const pesoCustos = atual.receitaBruta > 0 ? (atual.custos / atual.receitaBruta) * 100 : 0;
  const pesoDespesas = atual.receitaBruta > 0 ? (atual.despesas / atual.receitaBruta) * 100 : 0;
  const totalGastos = atual.custos + atual.despesas;
  const sobraOperacional = atual.receitaLiquida - totalGastos;
  const percentualComprometido =
    atual.receitaLiquida > 0 ? (totalGastos / atual.receitaLiquida) * 100 : 100;
  const resumo = {
    titulo:
      sobraOperacional >= 0
        ? "A receita cobriu os custos e as despesas do período"
        : "Os custos e as despesas superaram a receita líquida",
    texto:
      sobraOperacional >= 0
        ? `${pct(percentualComprometido)} da receita líquida foi comprometida com a operação, preservando ${brl(sobraOperacional)} de saldo operacional.`
        : `A operação consumiu ${pct(percentualComprometido)} da receita líquida e encerrou o período com insuficiência de ${brl(Math.abs(sobraOperacional))}.`,
    receita: atual.receitaBruta,
    gastos: totalGastos,
    saldo: sobraOperacional,
    percentualConsumido: Math.min(100, percentualComprometido),
  };

  const fraseVariacao = (valor: number | null, nome: string) => {
    if (valor == null) return `Sem base anterior para comparar ${nome}.`;
    if (Math.abs(valor) < 0.01) return `${nome} permaneceram estáveis frente ao mês anterior.`;
    return `${nome} ${valor > 0 ? "aumentaram" : "diminuíram"} ${pct(Math.abs(valor))} frente ao mês anterior.`;
  };

  const itens: InsightAutomatico[] = [
    {
      fonte: "Receitas",
      titulo: "Receita bruta",
      valor: brl(atual.receitaBruta, true),
      texto: `${fraseVariacao(variacaoReceita, "As receitas")} ${principalReceita ? `${principalReceita.nome} foi a principal origem, com ${brl(principalReceita.valor, true)}.` : "Não houve categoria de receita com movimento."}`,
      tom: variacaoReceita == null ? "neutro" : variacaoReceita >= 0 ? "positivo" : "negativo",
      progresso: 100,
      icone: TrendingUp,
    },
    {
      fonte: "Custos",
      titulo: "Custos operacionais",
      valor: brl(atual.custos, true),
      texto: `${fraseVariacao(variacaoCustos, "Os custos")} Eles representam ${pct(pesoCustos)} da receita${principalCusto ? `; ${principalCusto.nome} concentrou ${brl(principalCusto.valor, true)}` : ""}.`,
      tom: pesoCustos <= 50 ? "positivo" : pesoCustos <= 70 ? "atencao" : "negativo",
      progresso: Math.min(100, pesoCustos),
      icone: BadgeDollarSign,
    },
    {
      fonte: "Despesas",
      titulo: "Despesas operacionais",
      valor: brl(atual.despesas, true),
      texto: `${fraseVariacao(variacaoDespesas, "As despesas")} Elas consomem ${pct(pesoDespesas)} da receita${principalDespesa ? `; ${principalDespesa.nome} foi a maior, com ${brl(principalDespesa.valor, true)}` : ""}.`,
      tom: pesoDespesas <= 20 ? "positivo" : pesoDespesas <= 35 ? "atencao" : "negativo",
      progresso: Math.min(100, pesoDespesas),
      icone: TrendingDown,
    },
  ];

  return { resumo, itens };
}

function InsightCard({ insight }: { insight: InsightAutomatico }) {
  const estilo = tomEstilo(insight.tom);
  const Icone = insight.icone;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", estilo.soft)}>
          <Icone className="h-4 w-4" />
        </span>
        <span className={cn("tabular text-lg font-semibold", estilo.texto)}>{insight.valor}</span>
      </div>
      <p className="mt-3 text-sm font-semibold">{insight.titulo}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {insight.fonte}
      </p>
      <p className="mt-2 min-h-10 text-xs leading-relaxed text-muted-foreground">{insight.texto}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", estilo.barra)}
          style={{ width: `${Math.max(4, insight.progresso)}%` }}
        />
      </div>
    </div>
  );
}

function ResumoMetrica({
  icone: Icone,
  rotulo,
  valor,
  tom,
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: number;
  tom: Tom;
}) {
  const estilo = tomEstilo(tom);

  return (
    <div className="min-w-40 rounded-lg border bg-card px-3.5 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icone className={cn("h-3.5 w-3.5", estilo.texto)} />
        <span>{rotulo}</span>
      </div>
      <p className={cn("tabular mt-2 text-base font-semibold", estilo.texto)}>{brl(valor, true)}</p>
    </div>
  );
}
