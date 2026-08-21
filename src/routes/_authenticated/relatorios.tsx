import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  FileText,
  Printer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TopBar } from "@/components/TopBar";
import { Bloco, SemDados, SemEmpresa } from "@/components/ui-blocos";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/app-context";
import { filtrarLancamentosPorCentroCusto } from "@/lib/centro-custo";
import {
  useCategorias,
  useConfiguracao,
  useEmpresas,
  useLancamentos,
  usePlanosAcao,
} from "@/lib/data";
import {
  agregarPorCategoria,
  calcularDre,
  grupoLabels,
  mediaFechados,
  qualidadeResultado,
  type GrupoDre,
  type ResultadoMes,
} from "@/lib/dre";
import { calcularImpactos, gerarAlertas, type NivelAlerta } from "@/lib/insights";
import {
  filtrarLancamentosPorMeses,
  mesesDoPeriodoFiltro,
  periodoFiltroLabel,
} from "@/lib/periodo";
import { brl, dataBR, mesesCurtos, pct, variacao } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios | Ecossistema Financeiro BPO" },
      {
        name: "description",
        content:
          "Gere o relatório mensal do cliente com resultado, principais impactos, leitura da consultoria e plano de ação.",
      },
      { property: "og:title", content: "Relatórios | Ecossistema Financeiro BPO" },
      {
        property: "og:description",
        content: "Relatório pronto para apresentação ao cliente em um clique.",
      },
    ],
  }),
  component: RelatoriosPage,
});

const ordemPlano = {
  atrasado: 0,
  pendente: 1,
  em_andamento: 2,
  aguardando_cliente: 3,
  concluido: 4,
  cancelado: 5,
} as const;

const statusLabels: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  aguardando_cliente: "Aguardando cliente",
  concluido: "Concluído",
  atrasado: "Atrasado",
  cancelado: "Cancelado",
};

const prioridadeLabels: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

function RelatoriosPage() {
  const { empresaId, ano, mes, periodo, centroCusto } = useApp();
  const { data: empresas = [] } = useEmpresas();
  const { data: lancamentos = [], isLoading } = useLancamentos(empresaId, ano);
  const { data: categorias = [] } = useCategorias(empresaId);
  const { data: planos = [] } = usePlanosAcao(empresaId);
  const { data: config } = useConfiguracao(empresaId);

  const empresa = empresas.find((e) => e.id === empresaId);
  const margemDesejada = Number(config?.margem_desejada ?? 15);
  const lancamentosFiltrados = useMemo(
    () => filtrarLancamentosPorCentroCusto(lancamentos, centroCusto),
    [lancamentos, centroCusto],
  );
  const mesesPeriodo = useMemo(() => mesesDoPeriodoFiltro(periodo, mes), [periodo, mes]);
  const mesReferencia = mesesPeriodo.at(-1) ?? mes;
  const periodoLabel = periodoFiltroLabel(periodo, mes);
  const lancamentosPeriodo = useMemo(
    () => filtrarLancamentosPorMeses(lancamentosFiltrados, mesesPeriodo),
    [lancamentosFiltrados, mesesPeriodo],
  );
  const resultados = useMemo(
    () => calcularDre(lancamentosPeriodo, categorias),
    [lancamentosPeriodo, categorias],
  );
  const atual = totalizarResultados(resultados.filter((r) => mesesPeriodo.includes(r.mes)));
  const anterior = periodo === "mes_atual" && mes > 0 ? resultados[mes - 1] : undefined;
  const linhas = useMemo(
    () => agregarPorCategoria(lancamentosPeriodo, categorias),
    [lancamentosPeriodo, categorias],
  );
  const impactos = useMemo(
    () => calcularImpactos(lancamentosFiltrados, categorias, mesReferencia),
    [lancamentosFiltrados, categorias, mesReferencia],
  );
  const alertas = useMemo(
    () =>
      gerarAlertas(
        resultados,
        lancamentosPeriodo,
        categorias,
        mesReferencia,
        undefined,
        margemDesejada,
      ),
    [resultados, lancamentosPeriodo, categorias, mesReferencia, margemDesejada],
  );
  const qualidade = qualidadeResultado(atual, margemDesejada);
  const acoesAbertas = planos
    .filter((p) => p.status !== "concluido" && p.status !== "cancelado")
    .sort((a, b) => {
      const statusA = ordemPlano[a.status as keyof typeof ordemPlano] ?? 9;
      const statusB = ordemPlano[b.status as keyof typeof ordemPlano] ?? 9;
      if (statusA !== statusB) return statusA - statusB;
      return String(a.prazo ?? "9999-12-31").localeCompare(String(b.prazo ?? "9999-12-31"));
    })
    .slice(0, 8);

  const fechadoAteMes = resultados.filter((r) => r.temMovimento && mesesPeriodo.includes(r.mes));
  const acumuladoAno = totalizarResultados(resultados.filter((r) => mesesPeriodo.includes(r.mes)));
  const mediaReceita = mediaFechados(resultados, (r) => r.receitaBruta, mesReferencia);
  const mediaResultado = mediaFechados(resultados, (r) => r.resultadoOperacional, mesReferencia);
  const mesesComMovimento = fechadoAteMes.length;
  const totalLancamentosMes = lancamentosPeriodo.length;
  const naoRecorrentesMes = lancamentosPeriodo.filter((l) => l.nao_recorrente).length;

  const evolucao = resultados
    .filter((r) => mesesPeriodo.includes(r.mes) && r.temMovimento)
    .map((r) => ({
      mes: mesesCurtos[r.mes],
      receita: r.receitaBruta,
      resultado: r.resultadoOperacional,
      margem: Number(r.margemOperacional.toFixed(1)),
    }));

  const categoriasOperacionais = topCategorias(linhas, mesesPeriodo, [
    "deducoes",
    "custos",
    "despesas",
  ]).slice(0, 7);
  const receitasPorCategoria = topCategorias(linhas, mesesPeriodo, ["receita_operacional"]).slice(
    0,
    5,
  );

  function imprimirRelatorio() {
    document.body.classList.add("print-relatorio");
    const limparImpressao = () => document.body.classList.remove("print-relatorio");
    window.addEventListener("afterprint", limparImpressao, { once: true });
    window.print();
    window.setTimeout(limparImpressao, 1000);
  }

  return (
    <>
      <TopBar
        titulo="Relatórios"
        descricao="Relatório mensal para apresentação ao cliente"
        acoes={
          <Button size="sm" variant="outline" onClick={imprimirRelatorio} disabled={!empresaId}>
            <Printer className="mr-2 h-4 w-4" /> Imprimir / PDF
          </Button>
        }
      />
      <main className="relatorio-page space-y-5 p-6 print:bg-white print:p-0">
        {!empresaId ? (
          <SemEmpresa />
        ) : isLoading ? (
          <SemDados mensagem="Carregando relatório..." />
        ) : !atual.temMovimento ? (
          <SemDados mensagem="Sem lançamentos no período selecionado." />
        ) : (
          <article className="relatorio-print-root mx-auto max-w-6xl space-y-5 print:max-w-none print:space-y-3">
            <CapaRelatorio
              empresa={empresa?.nome ?? "Empresa"}
              cnpj={empresa?.cnpj}
              periodo={`${periodoLabel} de ${ano}`}
              qualidade={qualidade}
              resultado={atual.resultadoOperacional}
              margem={atual.margemOperacional}
              margemDesejada={margemDesejada}
              totalLancamentos={totalLancamentosMes}
            />

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <KpiRelatorio
                titulo="Receita operacional"
                valor={atual.receitaBruta}
                anterior={anterior?.receitaBruta}
                descricao={`Média no ano: ${brl(mediaReceita, true)}`}
                tom={atual.receitaBruta >= (anterior?.receitaBruta ?? 0) ? "positivo" : "negativo"}
              />
              <KpiRelatorio
                titulo="Resultado operacional"
                valor={atual.resultadoOperacional}
                anterior={anterior?.resultadoOperacional}
                descricao={`Média no ano: ${brl(mediaResultado, true)}`}
                tom={atual.resultadoOperacional >= 0 ? "positivo" : "negativo"}
              />
              <KpiRelatorio
                titulo="Margem operacional"
                valorTexto={pct(atual.margemOperacional)}
                variacaoTexto={`${formatarPontos(atual.margemOperacional - margemDesejada)} vs. meta`}
                descricao={`Meta: ${pct(margemDesejada)}`}
                tom={atual.margemOperacional >= margemDesejada ? "positivo" : "atencao"}
              />
              <KpiRelatorio
                titulo="Resultado líquido"
                valor={atual.resultadoLiquido}
                anterior={anterior?.resultadoLiquido}
                descricao={`${mesesComMovimento} mês(es) com movimento no ano`}
                tom={atual.resultadoLiquido >= 0 ? "positivo" : "negativo"}
              />
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
              <Bloco titulo="Resumo executivo" className="print:break-inside-avoid">
                <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
                  <div className="space-y-3 text-sm leading-6 text-muted-foreground">
                    {resumoExecutivo(atual, anterior, margemDesejada, qualidade.texto).map(
                      (texto) => (
                        <p key={texto}>{texto}</p>
                      ),
                    )}
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-4">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Base do relatório
                    </p>
                    <dl className="mt-3 space-y-2 text-sm">
                      <Item rotulo="Regime" valor="Caixa" />
                      <Item rotulo="Lançamentos" valor={String(totalLancamentosMes)} />
                      <Item rotulo="Não recorrentes" valor={String(naoRecorrentesMes)} />
                      <Item rotulo="Categorias ativas" valor={String(categorias.length)} />
                    </dl>
                  </div>
                </div>
              </Bloco>

              <Bloco titulo="Leitura da consultoria" className="print:break-inside-avoid">
                {alertas.length === 0 ? (
                  <SemDados mensagem="Sem observações relevantes." />
                ) : (
                  <ul className="space-y-3">
                    {alertas.slice(0, 5).map((a) => (
                      <li key={a.titulo} className="flex gap-3 rounded-lg border p-3 text-sm">
                        <span
                          className={cn(
                            "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                            alertaClasses(a.nivel),
                          )}
                        >
                          {iconeAlerta(a.nivel)}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold">{a.titulo}</span>
                          <span className="mt-0.5 block text-muted-foreground">{a.detalhe}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Bloco>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
              <Bloco
                titulo="Evolução do exercício"
                className="overflow-hidden print:break-inside-avoid"
              >
                {evolucao.length < 2 ? (
                  <SemDados mensagem="Importe mais meses para visualizar a evolução." />
                ) : (
                  <div className="h-[320px] min-w-[560px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={evolucao}
                        margin={{ top: 20, right: 18, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="var(--border)"
                        />
                        <ReferenceLine
                          yAxisId="valor"
                          y={0}
                          stroke="var(--foreground)"
                          strokeOpacity={0.35}
                        />
                        <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
                        <YAxis
                          yAxisId="valor"
                          tickFormatter={(v) => brl(Number(v), true)}
                          tickLine={false}
                          axisLine={false}
                          fontSize={12}
                          width={86}
                        />
                        <YAxis
                          yAxisId="margem"
                          orientation="right"
                          tickFormatter={(v) => pct(Number(v), 0)}
                          tickLine={false}
                          axisLine={false}
                          fontSize={12}
                          width={46}
                        />
                        <Tooltip
                          formatter={(v, name) =>
                            name === "Margem operacional" ? pct(Number(v)) : brl(Number(v))
                          }
                        />
                        <Line
                          yAxisId="valor"
                          type="monotone"
                          dataKey="receita"
                          name="Receita"
                          stroke="var(--info)"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                        <Line
                          yAxisId="valor"
                          type="monotone"
                          dataKey="resultado"
                          name="Resultado operacional"
                          stroke="var(--positive)"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                        <Line
                          yAxisId="margem"
                          type="monotone"
                          dataKey="margem"
                          name="Margem operacional"
                          stroke="var(--warning)"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Bloco>

              <Bloco titulo="DRE resumido" className="print:break-inside-avoid">
                <dl className="space-y-2 text-sm">
                  <LinhaDre
                    rotulo="Receita operacional"
                    valor={atual.receitaBruta}
                    base={atual.receitaBruta}
                  />
                  <LinhaDre
                    rotulo="(-) Deduções e custos"
                    valor={-(atual.deducoes + atual.custos)}
                    base={atual.receitaBruta}
                  />
                  <LinhaDre
                    rotulo="= Resultado bruto"
                    valor={atual.resultadoBruto}
                    base={atual.receitaBruta}
                    destaque
                  />
                  <LinhaDre
                    rotulo="(-) Despesas operacionais"
                    valor={-atual.despesas}
                    base={atual.receitaBruta}
                  />
                  <LinhaDre
                    rotulo="= Resultado operacional"
                    valor={atual.resultadoOperacional}
                    base={atual.receitaBruta}
                    destaque
                  />
                  <LinhaDre
                    rotulo="Atividade de investimento"
                    valor={atual.financeiro}
                    base={atual.receitaBruta}
                  />
                  <LinhaDre
                    rotulo="Atividade de financiamento"
                    valor={atual.naoOperacional}
                    base={atual.receitaBruta}
                  />
                  <LinhaDre
                    rotulo="= Resultado líquido"
                    valor={atual.resultadoLiquido}
                    base={atual.receitaBruta}
                    destaque
                    forte
                  />
                </dl>
              </Bloco>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <TabelaComparativoMensal atual={atual} anterior={anterior} acumulado={acumuladoAno} />
              <ComposicaoResultado
                receitas={receitasPorCategoria}
                operacionais={categoriasOperacionais}
                receitaTotal={atual.receitaBruta}
                saidaTotal={atual.deducoes + atual.custos + atual.despesas}
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <Bloco titulo="Principais impactos do período" className="print:break-inside-avoid">
                <div className="grid gap-4 md:grid-cols-2">
                  <ListaImpactos
                    titulo="Melhoraram o resultado"
                    itens={impactos.positivos.slice(0, 5)}
                  />
                  <ListaImpactos
                    titulo="Pressionaram o resultado"
                    itens={impactos.negativos.slice(0, 5)}
                    negativo
                  />
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Os impactos comparam o mês selecionado com o mês anterior e consideram efeito no
                  resultado operacional.
                </p>
              </Bloco>

              <Bloco titulo="Plano de ação em aberto" className="print:break-inside-avoid">
                {acoesAbertas.length === 0 ? (
                  <SemDados mensagem="Nenhuma ação em aberto." />
                ) : (
                  <ol className="space-y-3">
                    {acoesAbertas.map((p, index) => (
                      <li key={p.id} className="rounded-lg border p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                            {index + 1}
                          </span>
                          <BadgePlano tipo="prioridade" valor={p.prioridade} />
                          <BadgePlano tipo="status" valor={p.status} />
                        </div>
                        <p className="mt-2 font-semibold">{p.acao}</p>
                        <p className="mt-1 text-muted-foreground">{p.problema}</p>
                        {p.resultado_esperado && (
                          <p className="mt-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                            Resultado esperado: {p.resultado_esperado}
                          </p>
                        )}
                        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {p.responsavel && <span>Responsável: {p.responsavel}</span>}
                          {p.categoria && <span>Categoria: {p.categoria}</span>}
                          {p.prazo && <span>Prazo: {dataBR(p.prazo)}</span>}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </Bloco>
            </div>

            <RodapeRelatorio
              empresa={empresa?.nome ?? "Empresa"}
              periodo={`${periodoLabel} de ${ano}`}
              acumulado={acumuladoAno}
            />
          </article>
        )}
      </main>
    </>
  );
}

function CapaRelatorio({
  empresa,
  cnpj,
  periodo,
  qualidade,
  resultado,
  margem,
  margemDesejada,
  totalLancamentos,
}: {
  empresa: string;
  cnpj: string | null | undefined;
  periodo: string;
  qualidade: { nivel: string; texto: string };
  resultado: number;
  margem: number;
  margemDesejada: number;
  totalLancamentos: number;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-card print:break-inside-avoid print:shadow-none">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="p-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" /> Relatório gerencial
            </span>
            <span>Regime de caixa</span>
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-normal sm:text-3xl">{empresa}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {periodo}
            {cnpj ? ` · CNPJ ${cnpj}` : ""}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MiniResumo
              label="Resultado operacional"
              value={brl(resultado)}
              good={resultado >= 0}
            />
            <MiniResumo
              label="Margem operacional"
              value={pct(margem)}
              good={margem >= margemDesejada}
            />
            <MiniResumo label="Lançamentos analisados" value={String(totalLancamentos)} />
          </div>
        </div>
        <div className={cn("flex flex-col justify-between p-6", qualidadeClasse(qualidade.nivel))}>
          <div>
            <p className="text-xs font-semibold uppercase opacity-80">Diagnóstico</p>
            <p className="mt-2 text-xl font-semibold">{qualidade.texto}</p>
          </div>
          <div className="mt-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium opacity-80">Meta de margem</p>
              <p className="tabular text-2xl font-semibold">{pct(margemDesejada)}</p>
            </div>
            <CircleDot className="h-10 w-10 opacity-70" />
          </div>
        </div>
      </div>
    </section>
  );
}

function KpiRelatorio({
  titulo,
  valor,
  valorTexto,
  anterior,
  variacaoTexto,
  descricao,
  tom,
}: {
  titulo: string;
  valor?: number | undefined;
  valorTexto?: string | undefined;
  anterior?: number | undefined;
  variacaoTexto?: string | undefined;
  descricao: string;
  tom: "positivo" | "negativo" | "atencao";
}) {
  const delta = valor !== undefined && anterior !== undefined ? variacao(valor, anterior) : null;
  const textoVariacao =
    variacaoTexto ??
    (delta === null
      ? "sem base anterior"
      : `${delta > 0 ? "+" : ""}${pct(delta)} vs. mês anterior`);

  return (
    <div className="rounded-xl border bg-card p-4 shadow-card print:break-inside-avoid print:shadow-none">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{titulo}</p>
      <p
        className={cn(
          "tabular mt-2 text-2xl font-semibold",
          tom === "positivo" && "text-positive",
          tom === "negativo" && "text-negative",
          tom === "atencao" && "text-warning",
        )}
      >
        {valorTexto ?? brl(valor ?? 0)}
      </p>
      <p className="mt-2 text-xs font-medium text-muted-foreground">{textoVariacao}</p>
      <p className="mt-1 text-xs text-muted-foreground">{descricao}</p>
    </div>
  );
}

function TabelaComparativoMensal({
  atual,
  anterior,
  acumulado,
}: {
  atual: ResultadoMes;
  anterior: ResultadoMes | undefined;
  acumulado: ResultadoMes;
}) {
  const linhas = [
    ["Receita operacional", atual.receitaBruta, anterior?.receitaBruta, acumulado.receitaBruta],
    ["Receita líquida", atual.receitaLiquida, anterior?.receitaLiquida, acumulado.receitaLiquida],
    ["Resultado bruto", atual.resultadoBruto, anterior?.resultadoBruto, acumulado.resultadoBruto],
    [
      "Resultado operacional",
      atual.resultadoOperacional,
      anterior?.resultadoOperacional,
      acumulado.resultadoOperacional,
    ],
    [
      "Resultado líquido",
      atual.resultadoLiquido,
      anterior?.resultadoLiquido,
      acumulado.resultadoLiquido,
    ],
  ] as const;

  return (
    <Bloco titulo="Comparativo financeiro" className="overflow-hidden print:break-inside-avoid">
      <div className="-mx-5 -mb-5 overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
              <th className="px-5 py-2 text-left font-medium">Indicador</th>
              <th className="px-3 py-2 text-right font-medium">Mês atual</th>
              <th className="px-3 py-2 text-right font-medium">Mês anterior</th>
              <th className="px-3 py-2 text-right font-medium">Variação</th>
              <th className="px-5 py-2 text-right font-medium">Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(([nome, valorAtual, valorAnterior, valorAcumulado]) => {
              const delta = valorAnterior === undefined ? null : valorAtual - valorAnterior;
              return (
                <tr key={nome} className="border-b last:border-0">
                  <td className="px-5 py-2 font-medium">{nome}</td>
                  <td className={cn("tabular px-3 py-2 text-right", corValor(valorAtual))}>
                    {brl(valorAtual)}
                  </td>
                  <td className="tabular px-3 py-2 text-right text-muted-foreground">
                    {valorAnterior === undefined ? "—" : brl(valorAnterior)}
                  </td>
                  <td
                    className={cn(
                      "tabular px-3 py-2 text-right",
                      delta === null ? "text-muted-foreground" : corValor(delta),
                    )}
                  >
                    {delta === null ? "—" : `${delta > 0 ? "+" : ""}${brl(delta)}`}
                  </td>
                  <td
                    className={cn(
                      "tabular px-5 py-2 text-right font-medium",
                      corValor(valorAcumulado),
                    )}
                  >
                    {brl(valorAcumulado)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Bloco>
  );
}

function ComposicaoResultado({
  receitas,
  operacionais,
  receitaTotal,
  saidaTotal,
}: {
  receitas: CategoriaResumo[];
  operacionais: CategoriaResumo[];
  receitaTotal: number;
  saidaTotal: number;
}) {
  return (
    <Bloco titulo="Composição por categoria" className="print:break-inside-avoid">
      <div className="grid gap-5 md:grid-cols-2">
        <ListaCategorias
          titulo="Receitas"
          itens={receitas}
          total={receitaTotal}
          vazio="Sem receita classificada."
        />
        <ListaCategorias
          titulo="Custos e despesas"
          itens={operacionais}
          total={saidaTotal}
          vazio="Sem custos ou despesas no mês."
          saida
        />
      </div>
    </Bloco>
  );
}

function ListaCategorias({
  titulo,
  itens,
  total,
  vazio,
  saida,
}: {
  titulo: string;
  itens: CategoriaResumo[];
  total: number;
  vazio: string;
  saida?: boolean;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{titulo}</p>
        <span className="tabular text-xs font-medium text-muted-foreground">
          {brl(total, true)}
        </span>
      </div>
      {itens.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="space-y-3">
          {itens.map((item) => {
            const participacao = total ? (item.valor / total) * 100 : 0;
            return (
              <li key={`${item.grupo}-${item.nome}`} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{item.nome}</span>
                  <span
                    className={cn(
                      "tabular shrink-0 font-semibold",
                      saida ? "text-negative" : "text-positive",
                    )}
                  >
                    {brl(item.valor, true)}
                  </span>
                </div>
                <div className="h-2 rounded bg-muted">
                  <div
                    className={cn("h-2 rounded", saida ? "bg-negative" : "bg-positive")}
                    style={{ width: `${Math.min(100, Math.max(4, participacao))}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {pct(participacao)} de {saida ? "custos e despesas" : "receitas"} ·{" "}
                  {grupoLabels[item.grupo]}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ListaImpactos({
  titulo,
  itens,
  negativo,
}: {
  titulo: string;
  itens: Array<{ nome: string; grupo: string; efeito: number }>;
  negativo?: boolean;
}) {
  return (
    <div>
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {negativo ? (
          <TrendingDown className="h-4 w-4 text-negative" />
        ) : (
          <TrendingUp className="h-4 w-4 text-positive" />
        )}
        {titulo}
      </p>
      {itens.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Nenhum impacto relevante.
        </p>
      ) : (
        <ul className="space-y-2">
          {itens.map((i) => (
            <li key={i.nome} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-medium">{i.nome}</span>
                <span
                  className={cn(
                    "tabular shrink-0 font-semibold",
                    i.efeito >= 0 ? "text-positive" : "text-negative",
                  )}
                >
                  {i.efeito > 0 ? "+" : ""}
                  {brl(i.efeito)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{i.grupo}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LinhaDre({
  rotulo,
  valor,
  base,
  destaque,
  forte,
}: {
  rotulo: string;
  valor: number;
  base: number;
  destaque?: boolean;
  forte?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b pb-2 last:border-0",
        destaque && "rounded-md border-0 bg-secondary px-3 py-2",
        forte && "bg-primary text-primary-foreground",
      )}
    >
      <dt className={cn("text-muted-foreground", forte && "text-primary-foreground/80")}>
        {rotulo}
      </dt>
      <dd className={cn("tabular text-right font-medium", valor < 0 && !forte && "text-negative")}>
        {brl(valor)}
        <span
          className={cn(
            "ml-2 text-xs text-muted-foreground",
            forte && "text-primary-foreground/75",
          )}
        >
          {base ? pct((valor / base) * 100) : "—"}
        </span>
      </dd>
    </div>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="tabular text-right font-medium">{valor}</dd>
    </div>
  );
}

function MiniResumo({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tabular mt-1 text-lg font-semibold",
          good === true && "text-positive",
          good === false && "text-negative",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function BadgePlano({ tipo, valor }: { tipo: "prioridade" | "status"; valor: string | null }) {
  const texto =
    tipo === "prioridade"
      ? (prioridadeLabels[String(valor)] ?? String(valor ?? "Prioridade"))
      : (statusLabels[String(valor)] ?? String(valor ?? "Status"));

  return (
    <span
      className={cn(
        "rounded px-2 py-0.5 text-[11px] font-semibold",
        tipo === "prioridade" && valor === "alta" && "bg-negative-soft text-negative",
        tipo === "prioridade" && valor === "media" && "bg-warning-soft text-warning",
        tipo === "prioridade" && valor === "baixa" && "bg-info-soft text-info",
        tipo === "status" && valor === "atrasado" && "bg-negative-soft text-negative",
        tipo === "status" && valor === "em_andamento" && "bg-info-soft text-info",
        tipo === "status" && valor === "aguardando_cliente" && "bg-warning-soft text-warning",
        tipo === "status" && valor === "pendente" && "bg-muted text-muted-foreground",
      )}
    >
      {texto}
    </span>
  );
}

function RodapeRelatorio({
  empresa,
  periodo,
  acumulado,
}: {
  empresa: string;
  periodo: string;
  acumulado: ResultadoMes;
}) {
  return (
    <footer className="rounded-xl border bg-card p-5 text-xs text-muted-foreground shadow-card print:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          {empresa} · {periodo}
        </span>
        <span className="inline-flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Acumulado operacional: {brl(acumulado.resultadoOperacional)}
        </span>
      </div>
      <p className="mt-3">
        Relatório gerencial elaborado a partir dos lançamentos efetivamente liquidados no período.
        Valores financeiros seguem o tratamento e a classificação definidos no DRE do projeto.
      </p>
    </footer>
  );
}

type CategoriaResumo = {
  nome: string;
  grupo: GrupoDre;
  valor: number;
};

function topCategorias(
  linhas: ReturnType<typeof agregarPorCategoria>,
  mesesVisiveis: number[],
  grupos: GrupoDre[],
): CategoriaResumo[] {
  return linhas
    .filter((linha) => grupos.includes(linha.grupo))
    .map((linha) => ({
      nome: linha.nome,
      grupo: linha.grupo,
      valor: mesesVisiveis.reduce((s, mes) => s + Math.abs(linha.valores[mes] ?? 0), 0),
    }))
    .filter((linha) => linha.valor > 0)
    .sort((a, b) => b.valor - a.valor);
}

function totalizarResultados(resultados: ResultadoMes[]): ResultadoMes {
  const total = resultados.reduce(
    (acc, r) => ({
      ...acc,
      receitaBruta: acc.receitaBruta + r.receitaBruta,
      deducoes: acc.deducoes + r.deducoes,
      receitaLiquida: acc.receitaLiquida + r.receitaLiquida,
      custos: acc.custos + r.custos,
      resultadoBruto: acc.resultadoBruto + r.resultadoBruto,
      despesas: acc.despesas + r.despesas,
      resultadoOperacional: acc.resultadoOperacional + r.resultadoOperacional,
      financeiro: acc.financeiro + r.financeiro,
      resultadoOpFin: acc.resultadoOpFin + r.resultadoOpFin,
      naoOperacional: acc.naoOperacional + r.naoOperacional,
      aportesEmprestimos: acc.aportesEmprestimos + r.aportesEmprestimos,
      resultadoLiquido: acc.resultadoLiquido + r.resultadoLiquido,
      temMovimento: acc.temMovimento || r.temMovimento,
    }),
    {
      mes: 0,
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

function resumoExecutivo(
  atual: ResultadoMes,
  anterior: ResultadoMes | undefined,
  margemDesejada: number,
  qualidade: string,
) {
  const receitaVar = anterior ? variacao(atual.receitaBruta, anterior.receitaBruta) : null;
  const resultadoVar = anterior ? atual.resultadoOperacional - anterior.resultadoOperacional : null;
  const distanciaMeta = atual.margemOperacional - margemDesejada;

  return [
    `A operação encerrou o mês com receita operacional de ${brl(atual.receitaBruta)} e resultado operacional de ${brl(atual.resultadoOperacional)}, equivalente a uma margem de ${pct(atual.margemOperacional)}.`,
    receitaVar === null
      ? "Não há base comparável do mês anterior para medir variação de receita."
      : `Em relação ao mês anterior, a receita ${receitaVar >= 0 ? "cresceu" : "recuou"} ${pct(Math.abs(receitaVar))} e o resultado operacional variou ${resultadoVar && resultadoVar > 0 ? "+" : ""}${brl(resultadoVar ?? 0)}.`,
    `A qualidade do resultado foi classificada como: ${qualidade}. A margem ficou ${distanciaMeta >= 0 ? "acima" : "abaixo"} da meta em ${formatarPontos(Math.abs(distanciaMeta))}.`,
  ];
}

function alertaClasses(nivel: NivelAlerta) {
  return {
    positivo: "bg-positive-soft text-positive",
    negativo: "bg-negative-soft text-negative",
    atencao: "bg-warning-soft text-warning",
    neutro: "bg-info-soft text-info",
  }[nivel];
}

function iconeAlerta(nivel: NivelAlerta) {
  if (nivel === "positivo") return <CheckCircle2 className="h-4 w-4" />;
  if (nivel === "negativo") return <TrendingDown className="h-4 w-4" />;
  if (nivel === "atencao") return <AlertTriangle className="h-4 w-4" />;
  return <BarChart3 className="h-4 w-4" />;
}

function qualidadeClasse(nivel: string) {
  if (nivel === "critico") return "bg-negative-soft text-negative";
  if (nivel === "atencao") return "bg-warning-soft text-warning";
  if (nivel === "extraordinario") return "bg-extra-soft text-extra";
  return "bg-positive-soft text-positive";
}

function corValor(valor: number) {
  if (valor < 0) return "text-negative";
  if (valor > 0) return "text-foreground";
  return "text-muted-foreground";
}

function formatarPontos(valor: number) {
  const sinal = valor > 0 ? "+" : valor < 0 ? "-" : "";
  return `${sinal}${Math.abs(valor).toFixed(1).replace(".", ",")} p.p.`;
}
