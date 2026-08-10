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
  Gauge,
  Minus,
  Plus,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Bloco, Kpi, SemDados, SemEmpresa, type Tom } from "@/components/ui-blocos";
import { useApp } from "@/lib/app-context";
import { useCategorias, useConfiguracao, useEmpresas, useLancamentos } from "@/lib/data";
import {
  calcularDre,
  mesDaCompetencia,
  qualidadeResultado,
  type Categoria,
  type Lancamento,
} from "@/lib/dre";
import { calcularImpactos } from "@/lib/insights";
import { brl, meses, pct, variacao } from "@/lib/format";
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

function HomePage() {
  const { empresaId, ano, mes } = useApp();
  const { data: empresas = [] } = useEmpresas();
  const { data: lancamentos = [], isLoading } = useLancamentos(empresaId, ano);
  const { data: categorias = [] } = useCategorias(empresaId);
  const { data: config } = useConfiguracao(empresaId);

  const empresa = empresas.find((e) => e.id === empresaId);
  const margemDesejada = Number(config?.margem_desejada ?? 15);

  const resultados = useMemo(() => calcularDre(lancamentos, categorias), [lancamentos, categorias]);
  const atual = resultados[mes]!;
  const anterior = mes > 0 ? resultados[mes - 1] : undefined;
  const custosOperacionais = atual.deducoes + atual.custos;

  const impactos = useMemo(
    () => calcularImpactos(lancamentos, categorias, mes),
    [lancamentos, categorias, mes],
  );
  const caminhoGastos = useMemo(
    () => calcularCaminhoGastos(lancamentos, categorias, mes, custosOperacionais, atual.despesas),
    [lancamentos, categorias, mes, custosOperacionais, atual.despesas],
  );

  const qualidade = qualidadeResultado(atual, margemDesejada);
  const estilo = qualidadeEstilo[qualidade.nivel]!;
  const pesoCustos = percentualSobreReceita(custosOperacionais, atual.receitaBruta);
  const pesoDespesas = percentualSobreReceita(atual.despesas, atual.receitaBruta);
  const pesoResultado = percentualSobreReceita(atual.resultadoOperacional, atual.receitaBruta);
  const scoreQualidade = Math.max(
    0,
    Math.min(100, Math.round((atual.margemOperacional / Math.max(margemDesejada * 1.5, 1)) * 100)),
  );
  const gapMeta = atual.margemOperacional - margemDesejada;

  const grafico = [
    { nome: "Receita", valor: atual.receitaBruta, cor: "var(--info)" },
    { nome: "Custos Op.", valor: custosOperacionais, cor: "var(--warning)" },
    { nome: "Despesas Op.", valor: atual.despesas, cor: "var(--negative)" },
    {
      nome: "Resultado Op.",
      valor: atual.resultadoOperacional,
      cor: atual.resultadoOperacional >= 0 ? "var(--positive)" : "var(--negative)",
    },
  ];

  const tom = (v: number): Tom => (v > 0 ? "positivo" : v < 0 ? "negativo" : "neutro");

  return (
    <>
      <TopBar
        titulo="Home"
        descricao={`${empresa?.nome ?? "Selecione uma empresa"} · ${meses[mes]} de ${ano}`}
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
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
                  <div className="h-72 min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={grafico} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="grafico-receita" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#2563eb" />
                            <stop offset="100%" stopColor="#60a5fa" />
                          </linearGradient>
                          <linearGradient id="grafico-custos" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" />
                            <stop offset="100%" stopColor="#fcd34d" />
                          </linearGradient>
                          <linearGradient id="grafico-despesas" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#ef4444" />
                            <stop offset="100%" stopColor="#fca5a5" />
                          </linearGradient>
                          <linearGradient id="grafico-resultado" x1="0" x2="0" y1="0" y2="1">
                            <stop
                              offset="0%"
                              stopColor={atual.resultadoOperacional >= 0 ? "#16a34a" : "#ef4444"}
                            />
                            <stop
                              offset="100%"
                              stopColor={atual.resultadoOperacional >= 0 ? "#86efac" : "#fca5a5"}
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
                  <div className="flex flex-col justify-center gap-4 border-t pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                    <IndicadorPeso
                      icone={BadgeDollarSign}
                      rotulo="Custos sobre receita"
                      valor={custosOperacionais}
                      percentual={pesoCustos}
                      tom="atencao"
                    />
                    <IndicadorPeso
                      icone={TrendingDown}
                      rotulo="Despesas sobre receita"
                      valor={atual.despesas}
                      percentual={pesoDespesas}
                      tom="negativo"
                    />
                    <IndicadorPeso
                      icone={TrendingUp}
                      rotulo="Resultado sobre receita"
                      valor={atual.resultadoOperacional}
                      percentual={pesoResultado}
                      tom={tom(atual.resultadoOperacional)}
                    />
                  </div>
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

                <div className="mt-5 space-y-4">
                  <IndicadorMeta
                    icone={Target}
                    rotulo="Meta operacional"
                    valor={pct(margemDesejada)}
                    detalhe={
                      gapMeta >= 0
                        ? `${pct(gapMeta)} acima da meta`
                        : `${pct(Math.abs(gapMeta))} abaixo da meta`
                    }
                    progresso={scoreQualidade}
                    tom={gapMeta >= 0 ? "positivo" : "atencao"}
                  />
                  <IndicadorMeta
                    icone={Gauge}
                    rotulo="Resultado gerado"
                    valor={brl(atual.resultadoOperacional, true)}
                    detalhe={`sobre ${brl(atual.receitaBruta, true)} de receita`}
                    progresso={Math.max(0, Math.min(100, Math.abs(pesoResultado)))}
                    tom={tom(atual.resultadoOperacional)}
                  />
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
  mes: number,
  custosOperacionais: number,
  despesasOperacionais: number,
) {
  const valorPorPrefixo = (prefixo: string, nomeContem?: string) =>
    lancamentos.reduce((total, lancamento) => {
      if (mesDaCompetencia(lancamento.competencia) !== mes) return total;
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

function percentualSobreReceita(valor: number, receita: number) {
  return receita ? (valor / receita) * 100 : 0;
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

function IndicadorPeso({
  icone: Icone,
  rotulo,
  valor,
  percentual,
  tom,
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: number;
  percentual: number;
  tom: Tom;
}) {
  const estilo = tomEstilo(tom);
  const largura = Math.max(0, Math.min(100, Math.abs(percentual)));

  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", estilo.soft)}>
            <Icone className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-sm font-medium">{rotulo}</span>
        </div>
        <div className="text-right">
          <p className={cn("tabular text-sm font-semibold", estilo.texto)}>{pct(percentual)}</p>
          <p className="tabular text-[11px] text-muted-foreground">{brl(valor, true)}</p>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", estilo.barra)} style={{ width: `${largura}%` }} />
      </div>
    </div>
  );
}

function IndicadorMeta({
  icone: Icone,
  rotulo,
  valor,
  detalhe,
  progresso,
  tom,
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: string;
  detalhe: string;
  progresso: number;
  tom: Tom;
}) {
  const estilo = tomEstilo(tom);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", estilo.soft)}>
            <Icone className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{rotulo}</p>
            <p className="truncate text-xs text-muted-foreground">{detalhe}</p>
          </div>
        </div>
        <span className={cn("tabular text-sm font-semibold", estilo.texto)}>{valor}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", estilo.barra)}
          style={{ width: `${Math.max(0, Math.min(100, progresso))}%` }}
        />
      </div>
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
