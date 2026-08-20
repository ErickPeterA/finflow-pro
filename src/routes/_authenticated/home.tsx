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
  Minus,
  Plus,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Bloco, Kpi, SemDados, SemEmpresa, type Tom } from "@/components/ui-blocos";
import { useApp } from "@/lib/app-context";
import { filtrarLancamentosPorCentroCusto } from "@/lib/centro-custo";
import { useCategorias, useConfiguracao, useEmpresas, useLancamentos } from "@/lib/data";
import {
  calcularDre,
  mesDaCompetencia,
  qualidadeResultado,
  type Categoria,
  type Lancamento,
} from "@/lib/dre";
import { calcularImpactos } from "@/lib/insights";
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
  const { data: empresas = [] } = useEmpresas();
  const { data: lancamentos = [], isLoading } = useLancamentos(empresaId, ano);
  const { data: categorias = [] } = useCategorias(empresaId);
  const { data: config } = useConfiguracao(empresaId);

  const empresa = empresas.find((e) => e.id === empresaId);
  const margemDesejada = Number(config?.margem_desejada ?? 15);

  const lancamentosFiltrados = useMemo(
    () => filtrarLancamentosPorCentroCusto(lancamentos, centroCusto),
    [lancamentos, centroCusto],
  );
  const resultados = useMemo(
    () => calcularDre(lancamentosFiltrados, categorias),
    [lancamentosFiltrados, categorias],
  );
  const mesesPeriodo = useMemo(() => mesesDoPeriodoFiltro(periodo, mes), [periodo, mes]);
  const mesReferencia = mesesPeriodo.at(-1) ?? mes;
  const atual = useMemo(
    () => totalizarResultadosPeriodo(resultados, mesesPeriodo),
    [resultados, mesesPeriodo],
  );
  const anterior = periodo === "mes_atual" && mes > 0 ? resultados[mes - 1] : undefined;
  const custosOperacionais = atual.deducoes + atual.custos;

  const impactos = useMemo(
    () => calcularImpactos(lancamentosFiltrados, categorias, mesReferencia),
    [lancamentosFiltrados, categorias, mesReferencia],
  );
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
                titulo="Receita do mês"
                valor={atual.receitaBruta}
                variacaoPct={variacao(atual.receitaBruta, anterior?.receitaBruta ?? 0)}
                anterior={anterior?.receitaBruta}
                tom="neutro"
              />
              <Kpi
                titulo="Resultado Bruto"
                valor={atual.resultadoBruto}
                variacaoPct={variacao(atual.resultadoBruto, anterior?.resultadoBruto ?? 0)}
                anterior={anterior?.resultadoBruto}
                tom={tom(atual.resultadoBruto)}
              />
              <Kpi
                titulo="Resultado Operacional"
                valor={atual.resultadoOperacional}
                variacaoPct={variacao(
                  atual.resultadoOperacional,
                  anterior?.resultadoOperacional ?? 0,
                )}
                anterior={anterior?.resultadoOperacional}
                tom={tom(atual.resultadoOperacional)}
              />
              <Kpi
                titulo="Resultado OP + Financeiro"
                valor={atual.resultadoOpFin}
                variacaoPct={variacao(atual.resultadoOpFin, anterior?.resultadoOpFin ?? 0)}
                anterior={anterior?.resultadoOpFin}
                tom={tom(atual.resultadoOpFin)}
              />
              <Kpi
                titulo="Resultado Líquido"
                valor={atual.resultadoLiquido}
                variacaoPct={variacao(atual.resultadoLiquido, anterior?.resultadoLiquido ?? 0)}
                anterior={anterior?.resultadoLiquido}
                tom={tom(atual.resultadoLiquido)}
              />
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
              titulo="Principais impactos do mês"
              acoes={
                <span className="text-xs text-muted-foreground">
                  {pct(impactos.explicado)} da variação explicada pelos 10 principais fatores
                </span>
              }
            >
              <div className="grid gap-6 lg:grid-cols-2">
                <ListaImpactos
                  titulo="Impactos positivos"
                  itens={impactos.positivos.slice(0, 5)}
                  positivo
                />
                <ListaImpactos
                  titulo="Impactos negativos"
                  itens={impactos.negativos.slice(0, 5)}
                  positivo={false}
                />
              </div>
              <p
                className={cn(
                  "mt-5 rounded-lg px-4 py-3 text-sm font-medium",
                  impactos.liquido >= 0
                    ? "bg-positive-soft text-positive"
                    : "bg-negative-soft text-negative",
                )}
              >
                Impacto líquido no resultado operacional: {brl(impactos.liquido)}
              </p>
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

function ListaImpactos({
  titulo,
  itens,
  positivo,
}: {
  titulo: string;
  itens: { nome: string; grupo: string; efeito: number }[];
  positivo: boolean;
}) {
  return (
    <div>
      <p
        className={cn(
          "flex items-center gap-2 text-sm font-semibold",
          positivo ? "text-positive" : "text-negative",
        )}
      >
        {positivo ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
        {titulo}
      </p>
      <ol className="mt-3 space-y-2">
        {itens.length === 0 && (
          <li className="text-sm text-muted-foreground">Nenhum fator relevante.</li>
        )}
        {itens.map((i, idx) => (
          <li key={i.nome} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">
              {idx + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{i.nome}</span>
              <span className="block text-xs text-muted-foreground">{i.grupo}</span>
            </span>
            <span
              className={cn(
                "tabular text-sm font-semibold",
                positivo ? "text-positive" : "text-negative",
              )}
            >
              {i.efeito > 0 ? "+" : ""}
              {brl(i.efeito)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
