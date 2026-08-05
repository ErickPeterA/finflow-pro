import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight, Minus, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Bloco, Kpi, SemDados, SemEmpresa, type Tom } from "@/components/ui-blocos";
import { useApp } from "@/lib/app-context";
import { useCategorias, useConfiguracao, useEmpresas, useLancamentos, useMetas } from "@/lib/data";
import { calcularDre, qualidadeResultado, type ResultadoMes } from "@/lib/dre";
import { calcularImpactos, gerarAlertas } from "@/lib/insights";
import { brl, meses, pct, variacao } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Home Executiva | Ecossistema Financeiro BPO" },
      {
        name: "description",
        content:
          "Visão executiva do mês: indicadores, formação do resultado, principais impactos e análises automáticas.",
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

function calcularMetricasHome(m: ResultadoMes): ResultadoMes {
  const saidasOperacionais = m.deducoes + m.custos + m.despesas;
  const resultadoOperacional = -saidasOperacionais;
  const resultadoOpFin = resultadoOperacional + m.financeiro;
  const resultadoLiquido = resultadoOpFin + m.naoOperacional;
  const margemOperacional = m.receitaBruta ? (resultadoOperacional / m.receitaBruta) * 100 : 0;
  const margemLiquida = m.receitaBruta ? (resultadoLiquido / m.receitaBruta) * 100 : 0;

  return {
    ...m,
    resultadoOperacional,
    resultadoOpFin,
    resultadoLiquido,
    margemOperacional,
    margemLiquida,
  };
}

function HomePage() {
  const { empresaId, ano, mes } = useApp();
  const { data: empresas = [] } = useEmpresas();
  const { data: lancamentos = [], isLoading } = useLancamentos(empresaId, ano);
  const { data: categorias = [] } = useCategorias(empresaId);
  const { data: metas = [] } = useMetas(empresaId, ano);
  const { data: config } = useConfiguracao(empresaId);

  const empresa = empresas.find((e) => e.id === empresaId);
  const margemDesejada = Number(config?.margem_desejada ?? 15);

  const resultados = useMemo(() => calcularDre(lancamentos, categorias), [lancamentos, categorias]);
  const resultadosHome = useMemo(() => resultados.map(calcularMetricasHome), [resultados]);
  const atual = resultados[mes]!;
  const anterior = mes > 0 ? resultados[mes - 1] : undefined;
  const atualHome = resultadosHome[mes]!;
  const anteriorHome = mes > 0 ? resultadosHome[mes - 1] : undefined;

  const metaReceita = useMemo(() => {
    const alvo = metas.find(
      (m) => m.tipo === "receita" && Number(m.competencia.slice(5, 7)) - 1 === mes,
    );
    return alvo ? Number(alvo.valor) : undefined;
  }, [metas, mes]);

  const impactos = useMemo(
    () => calcularImpactos(lancamentos, categorias, mes),
    [lancamentos, categorias, mes],
  );
  const alertas = useMemo(
    () => gerarAlertas(resultadosHome, lancamentos, categorias, mes, metaReceita, margemDesejada),
    [resultadosHome, lancamentos, categorias, mes, metaReceita, margemDesejada],
  );

  const qualidade = qualidadeResultado(atualHome, margemDesejada);
  const estilo = qualidadeEstilo[qualidade.nivel]!;

  const grafico = [
    { nome: "Receita Líquida", valor: atual.receitaLiquida, cor: "var(--info)" },
    { nome: "Custos", valor: atual.custos, cor: "var(--warning)" },
    { nome: "Despesas", valor: atual.despesas, cor: "var(--negative)" },
    {
      nome: "Resultado Op.",
      valor: atualHome.resultadoOperacional,
      cor: atualHome.resultadoOperacional >= 0 ? "var(--positive)" : "var(--negative)",
    },
  ];

  const tom = (v: number): Tom => (v > 0 ? "positivo" : v < 0 ? "negativo" : "neutro");

  return (
    <>
      <TopBar
        titulo="Home"
        descricao={`${empresa?.nome ?? "Selecione uma empresa"} · ${meses[mes]} de ${ano}`}
      />
      <main className="space-y-5 p-6">
        {!empresaId ? (
          <SemEmpresa />
        ) : isLoading ? (
          <SemDados mensagem="Carregando dados do período..." />
        ) : !atual.temMovimento ? (
          <SemDados mensagem="Nenhum lançamento importado para este mês. Comece pela tela de Importação NIBO." />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
                valor={atualHome.resultadoOperacional}
                variacaoPct={variacao(
                  atualHome.resultadoOperacional,
                  anteriorHome?.resultadoOperacional ?? 0,
                )}
                anterior={anteriorHome?.resultadoOperacional}
                tom={tom(atualHome.resultadoOperacional)}
              />
              <Kpi
                titulo="Operacional + Financeiro"
                valor={atualHome.resultadoOpFin}
                variacaoPct={variacao(atualHome.resultadoOpFin, anteriorHome?.resultadoOpFin ?? 0)}
                anterior={anteriorHome?.resultadoOpFin}
                tom={tom(atualHome.resultadoOpFin)}
              />
              <Kpi
                titulo="Resultado Líquido"
                valor={atualHome.resultadoLiquido}
                variacaoPct={variacao(atualHome.resultadoLiquido, anteriorHome?.resultadoLiquido ?? 0)}
                anterior={anteriorHome?.resultadoLiquido}
                tom={tom(atualHome.resultadoLiquido)}
              />
            </div>

            <Bloco titulo="Formação do resultado">
              <div className="flex flex-wrap items-stretch gap-2">
                <Etapa rotulo="Receita do mês" valor={atual.receitaBruta} tom="neutro" />
                <Operador icone="menos" />
                <Etapa rotulo="Deduções" valor={atual.deducoes} tom="negativo" />
                <Operador icone="igual" />
                <Etapa rotulo="Receita Líquida" valor={atual.receitaLiquida} tom="neutro" destaque />
                <Operador icone="menos" />
                <Etapa rotulo="Custos" valor={atual.custos} tom="negativo" />
                <Operador icone="igual" />
                <Etapa rotulo="Resultado Bruto" valor={atual.resultadoBruto} tom={tom(atual.resultadoBruto)} destaque />
                <Operador icone="menos" />
                <Etapa rotulo="Despesas" valor={atual.despesas} tom="negativo" />
                <Operador icone="igual" />
                <Etapa
                  rotulo="Resultado Operacional"
                  valor={atualHome.resultadoOperacional}
                  tom={tom(atualHome.resultadoOperacional)}
                  destaque
                />
                <Operador icone="mais" />
                <Etapa rotulo="Resultado Financeiro" valor={atual.financeiro} tom={tom(atual.financeiro)} />
                <Operador icone="igual" />
                <Etapa
                  rotulo="Resultado Líquido"
                  valor={atualHome.resultadoLiquido}
                  tom={tom(atualHome.resultadoLiquido)}
                  destaque
                />
              </div>
              {atual.naoOperacional !== 0 && (
                <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {brl(atual.naoOperacional)} de movimentações não operacionais (aportes,
                  empréstimos, transferências, investimentos) afetam o caixa e o resultado líquido,
                  mas não o resultado operacional.
                </p>
              )}
            </Bloco>

            <div className="grid gap-5 xl:grid-cols-3">
              <Bloco titulo="Visão geral do mês" className="xl:col-span-2">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={grafico} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="nome" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis
                        tickFormatter={(v) => brl(Number(v), true)}
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        width={80}
                      />
                      <Tooltip
                        formatter={(v) => brl(Number(v))}
                        contentStyle={{
                          borderRadius: 10,
                          border: "1px solid var(--border)",
                          background: "var(--card)",
                        }}
                      />
                      <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                        {grafico.map((g) => (
                          <Cell key={g.nome} fill={g.cor} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Margem operacional do mês: {pct(atualHome.margemOperacional)}
                </p>
              </Bloco>

              <Bloco titulo="Qualidade do resultado">
                <span
                  className={cn(
                    "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                    estilo.classe,
                  )}
                >
                  {estilo.rotulo}
                </span>
                <p className="mt-3 text-sm text-muted-foreground">{qualidade.texto}</p>
                <dl className="mt-4 space-y-2 text-sm">
                  <Linha rotulo="Gerado pela operação" valor={atualHome.resultadoOperacional} />
                  <Linha rotulo="Resultado financeiro" valor={atual.financeiro} />
                  <Linha rotulo="Aportes e empréstimos" valor={atual.aportesEmprestimos} />
                  <Linha
                    rotulo="Outras entradas extraordinárias"
                    valor={atual.naoOperacional - atual.aportesEmprestimos}
                  />
                  <div className="border-t pt-2">
                    <Linha rotulo="Margem operacional" valor={atualHome.margemOperacional} percentual />
                  </div>
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

            <Bloco titulo="Análises automáticas">
              {alertas.length === 0 ? (
                <SemDados mensagem="Sem alertas relevantes para o período." />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {alertas.map((a) => (
                    <div
                      key={a.titulo}
                      className={cn(
                        "rounded-lg border-l-4 bg-muted/40 px-4 py-3",
                        a.nivel === "positivo" && "border-l-positive",
                        a.nivel === "negativo" && "border-l-negative",
                        a.nivel === "atencao" && "border-l-warning",
                        a.nivel === "neutro" && "border-l-info",
                      )}
                    >
                      <p className="text-sm font-medium">{a.titulo}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{a.detalhe}</p>
                    </div>
                  ))}
                </div>
              )}
            </Bloco>
          </>
        )}
      </main>
    </>
  );
}

function Etapa({
  rotulo,
  valor,
  tom,
  destaque,
}: {
  rotulo: string;
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

function Linha({
  rotulo,
  valor,
  percentual,
}: {
  rotulo: string;
  valor: number;
  percentual?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd
        className={cn(
          "tabular font-medium",
          valor > 0 ? "text-positive" : valor < 0 ? "text-negative" : "text-foreground",
        )}
      >
        {percentual ? pct(valor) : brl(valor)}
      </dd>
    </div>
  );
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
          <li
            key={i.nome}
            className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
          >
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
