import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Download,
  FileText,
  ImagePlus,
  Pencil,
  Printer,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
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
  useEmpresaAtual,
  useLancamentos,
  usePlanosAcao,
} from "@/lib/data";
import {
  agregarPorCategoria,
  calcularDre,
  calcularDreHartwig,
  grupoLabels,
  mediaFechados,
  qualidadeResultado,
  type GrupoDre,
  type ResultadoMes,
} from "@/lib/dre";
import {
  calcularImpactos,
  calcularImpactosAno,
  gerarAlertas,
  type NivelAlerta,
} from "@/lib/insights";
import {
  filtrarLancamentosPorMeses,
  mesesDoPeriodoFiltro,
  periodoFiltroLabel,
} from "@/lib/periodo";
import { brl, dataBR, mesesCurtos, pct, variacao } from "@/lib/format";
import { mutateFinancialData } from "@/lib/financial-mutations.functions";
import { cn } from "@/lib/utils";
import {
  graficosRelatorio,
  layoutRelatorioPadrao,
  rotuloCategoriaRelatorio,
  tituloGraficoRelatorio,
  type GraficoRelatorioId,
  type RelatorioPptxLayout,
} from "@/lib/relatorio-config";

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
  const [gerandoPptx, setGerandoPptx] = useState(false);
  const [layoutRelatorio, setLayoutRelatorio] = useState<RelatorioPptxLayout>(() => ({
    graficos: [...layoutRelatorioPadrao.graficos],
  }));
  const { empresaId, ano, mes, mesesSelecionados, periodo, centroCusto } = useApp();
  const { data: empresa } = useEmpresaAtual(empresaId);
  const { data: lancamentos = [], isLoading } = useLancamentos(empresaId, ano);
  const { data: lancamentosAnoAnterior = [] } = useLancamentos(empresaId, ano - 1);
  const { data: categorias = [] } = useCategorias(empresaId);
  const { data: planos = [] } = usePlanosAcao(empresaId);
  const { data: config } = useConfiguracao(empresaId);
  const dreHartwig = String(empresa?.nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes("hartwig");

  const margemDesejada = Number(config?.margem_desejada ?? 15);
  const lancamentosFiltrados = useMemo(
    () => filtrarLancamentosPorCentroCusto(lancamentos, centroCusto),
    [lancamentos, centroCusto],
  );
  const lancamentosAnoAnteriorFiltrados = useMemo(
    () => filtrarLancamentosPorCentroCusto(lancamentosAnoAnterior, centroCusto),
    [lancamentosAnoAnterior, centroCusto],
  );
  const mesesPeriodo = useMemo(
    () => mesesDoPeriodoFiltro(periodo, mes, mesesSelecionados),
    [periodo, mes, mesesSelecionados],
  );
  const mesReferencia = mesesPeriodo.at(-1) ?? mes;
  const periodoLabel = periodoFiltroLabel(periodo, mes, mesesSelecionados);
  const lancamentosPeriodo = useMemo(
    () => filtrarLancamentosPorMeses(lancamentosFiltrados, mesesPeriodo),
    [lancamentosFiltrados, mesesPeriodo],
  );
  const resultados = useMemo(
    () =>
      dreHartwig
        ? calcularDreHartwig(lancamentosFiltrados, categorias)
        : calcularDre(lancamentosFiltrados, categorias),
    [lancamentosFiltrados, categorias, dreHartwig],
  );
  const resultadosAnoAnterior = useMemo(
    () =>
      dreHartwig
        ? calcularDreHartwig(lancamentosAnoAnteriorFiltrados, categorias)
        : calcularDre(lancamentosAnoAnteriorFiltrados, categorias),
    [lancamentosAnoAnteriorFiltrados, categorias, dreHartwig],
  );
  const atual = totalizarResultados(resultados.filter((r) => mesesPeriodo.includes(r.mes)));
  const anterior =
    mesesPeriodo.length === 1
      ? mesReferencia > 0
        ? resultados[mesReferencia - 1]
        : resultadosAnoAnterior[11]
      : undefined;
  const linhas = useMemo(
    () => agregarPorCategoria(lancamentosFiltrados, categorias),
    [lancamentosFiltrados, categorias],
  );
  const linhasAnoAnterior = useMemo(
    () => agregarPorCategoria(lancamentosAnoAnteriorFiltrados, categorias),
    [lancamentosAnoAnteriorFiltrados, categorias],
  );
  const impactos = useMemo(
    () =>
      periodo === "ano"
        ? calcularImpactosAno(lancamentosPeriodo, categorias)
        : calcularImpactos(
            lancamentosFiltrados,
            categorias,
            mesReferencia,
            lancamentosAnoAnteriorFiltrados,
          ),
    [
      periodo,
      lancamentosPeriodo,
      lancamentosFiltrados,
      lancamentosAnoAnteriorFiltrados,
      categorias,
      mesReferencia,
    ],
  );
  const alertas = useMemo(
    () =>
      gerarAlertas(
        resultados,
        lancamentosFiltrados,
        categorias,
        mesReferencia,
        undefined,
        margemDesejada,
      ),
    [resultados, lancamentosFiltrados, categorias, mesReferencia, margemDesejada],
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

  // Mantém no eixo todos os meses pedidos pelo filtro. Meses sem movimento
  // continuam como zero, em vez de fazer o ano parecer terminar antes de dezembro.
  const evolucao = resultados
    .filter((r) => mesesPeriodo.includes(r.mes))
    .map((r) => ({
      mes: mesesCurtos[r.mes] ?? `Mês ${r.mes + 1}`,
      receita: r.receitaBruta,
      resultado: r.resultadoOperacional,
      resultadoBruto: r.resultadoBruto,
      resultadoLiquido: r.resultadoLiquido,
      margem: Number(r.margemOperacional.toFixed(1)),
    }));
  const primeiroMesPeriodo = Math.min(...mesesPeriodo);
  const anteriorDashboard =
    primeiroMesPeriodo > 0 ? resultados[primeiroMesPeriodo - 1] : resultadosAnoAnterior[11];
  const evolucaoDashboard = [
    ...(anteriorDashboard
      ? [
          {
            mes: mesesCurtos[anteriorDashboard.mes] ?? "Anterior",
            receita: anteriorDashboard.receitaBruta,
            resultado: anteriorDashboard.resultadoOperacional,
            resultadoLiquido: anteriorDashboard.resultadoLiquido,
          },
        ]
      : []),
    ...resultados
      .filter((resultado) => mesesPeriodo.includes(resultado.mes))
      .map((resultado) => ({
        mes: mesesCurtos[resultado.mes] ?? `Mês ${resultado.mes + 1}`,
        receita: resultado.receitaBruta,
        resultado: resultado.resultadoOperacional,
        resultadoLiquido: resultado.resultadoLiquido,
      })),
    {
      mes: "Média ano",
      receita: mediaFechados(resultados, (resultado) => resultado.receitaBruta),
      resultado: mediaFechados(resultados, (resultado) => resultado.resultadoOperacional),
      resultadoLiquido: mediaFechados(resultados, (resultado) => resultado.resultadoLiquido),
    },
  ];

  const categoriasOperacionais = topCategorias(
    linhas,
    mesesPeriodo,
    ["deducoes", "custos", "despesas"],
    linhasAnoAnterior,
  ).slice(0, 7);
  const receitasPorCategoria = topCategorias(
    linhas,
    mesesPeriodo,
    ["receita_operacional"],
    linhasAnoAnterior,
  )
    .filter(
      (categoria) =>
        !ehChicagoBarbearia(empresa?.nome) || !ehCategoriaReceitaLegadaChicago(categoria.nome),
    )
    .slice(0, 5);

  function imprimirRelatorio() {
    document.body.classList.add("print-relatorio");
    const limparImpressao = () => document.body.classList.remove("print-relatorio");
    window.addEventListener("afterprint", limparImpressao, { once: true });
    window.print();
    window.setTimeout(limparImpressao, 1000);
  }

  async function baixarApresentacao() {
    if (!empresaId || !atual.temMovimento) return;
    setGerandoPptx(true);
    try {
      const { gerarRelatorioPptx } = await import("@/lib/relatorio-pptx");
      await gerarRelatorioPptx({
        empresa: empresa?.nome ?? "Empresa",
        logoClienteUrl: empresa?.logo_url ?? null,
        periodo: `${periodoLabel} de ${ano}`,
        ano,
        receita: atual.receitaBruta,
        deducoesCustos: atual.deducoes + atual.custos,
        despesas: atual.despesas,
        resultadoBruto: atual.resultadoBruto,
        resultadoOperacional: atual.resultadoOperacional,
        resultadoLiquido: atual.resultadoLiquido,
        margemOperacional: atual.margemOperacional,
        margemDesejada,
        resumo: resumoExecutivo(atual, anterior, margemDesejada, qualidade.texto),
        alertas: alertas.map(({ titulo, detalhe }) => ({ titulo, detalhe })),
        evolucao,
        evolucaoDashboard,
        receitasPorCategoria: receitasPorCategoria.map(({ nome, valor, valorAnterior }) => ({
          nome,
          valor,
          ...(valorAnterior !== undefined ? { valorAnterior } : {}),
        })),
        custosPorCategoria: categoriasOperacionais.map(({ nome, valor, valorAnterior }) => ({
          nome,
          valor,
          ...(valorAnterior !== undefined ? { valorAnterior } : {}),
        })),
        ...(anterior
          ? {
              comparacaoAnterior: {
                receita: anterior.receitaBruta,
                resultadoBruto: anterior.resultadoBruto,
                resultadoOperacional: anterior.resultadoOperacional,
                resultadoLiquido: anterior.resultadoLiquido,
                margemOperacional: anterior.margemOperacional,
                mes: mesesCurtos[anterior.mes] ?? "Mês anterior",
              },
            }
          : {}),
        impactosPositivos: impactos.positivos.slice(0, 5),
        impactosNegativos: impactos.negativos.slice(0, 5),
        acoes: acoesAbertas.map((acao) => ({
          acao: acao.acao,
          responsavel: acao.responsavel,
          prazo: acao.prazo ? dataBR(acao.prazo) : null,
          status: statusLabels[acao.status] ?? acao.status,
        })),
        layout: layoutRelatorio,
      });
      toast.success("Apresentação gerada com os dados do período selecionado.");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível gerar a apresentação.");
    } finally {
      setGerandoPptx(false);
    }
  }

  return (
    <>
      <TopBar
        titulo="Relatórios"
        descricao="Relatório mensal para apresentação ao cliente"
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={baixarApresentacao}
              disabled={!empresaId || !atual.temMovimento || gerandoPptx}
            >
              <Download className="mr-2 h-4 w-4" />
              {gerandoPptx ? "Gerando PPTX..." : "Baixar apresentação"}
            </Button>
            <Button size="sm" variant="outline" onClick={imprimirRelatorio} disabled={!empresaId}>
              <Printer className="mr-2 h-4 w-4" /> Imprimir / PDF
            </Button>
          </div>
        }
      />
      <main className="relatorio-page space-y-5 p-6 print:bg-white print:p-0">
        {empresaId && empresa && (
          <LogoClienteEditor
            empresaId={empresaId}
            empresaNome={empresa.nome}
            logoUrl={empresa.logo_url}
          />
        )}
        {!empresaId ? (
          <SemEmpresa />
        ) : isLoading ? (
          <SemDados mensagem="Carregando relatório..." />
        ) : !atual.temMovimento ? (
          <SemDados mensagem="Sem lançamentos no período selecionado." />
        ) : (
          <article className="relatorio-print-root mx-auto max-w-6xl space-y-5 print:max-w-none print:space-y-3">
            <ApresentacaoPreview
              empresa={empresa?.nome ?? "Empresa"}
              logoClienteUrl={empresa?.logo_url ?? null}
              periodo={`${periodoLabel} de ${ano}`}
              atual={atual}
              anterior={anterior}
              margemDesejada={margemDesejada}
              evolucao={evolucao}
              evolucaoDashboard={evolucaoDashboard}
              receitas={receitasPorCategoria}
              custos={categoriasOperacionais}
              impactosPositivos={impactos.positivos.slice(0, 5)}
              impactosNegativos={impactos.negativos.slice(0, 5)}
              alertas={alertas.slice(0, 5)}
              resumo={resumoExecutivo(atual, anterior, margemDesejada, qualidade.texto)}
              acoes={acoesAbertas.map((acao) => ({
                acao: acao.acao,
                responsavel: acao.responsavel,
                prazo: acao.prazo ? dataBR(acao.prazo) : null,
                status: statusLabels[acao.status] ?? acao.status,
              }))}
              layout={layoutRelatorio}
              onLayoutChange={setLayoutRelatorio}
            />

            <details open className="group rounded-xl border bg-card print:border-0">
              <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold print:hidden">
                Ver detalhamento dos dados do relatório
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (a prévia acima é a referência visual do PPTX)
                </span>
              </summary>
              <div className="space-y-5 border-t p-5">
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
                    tom={
                      atual.receitaBruta >= (anterior?.receitaBruta ?? 0) ? "positivo" : "negativo"
                    }
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
                        <p className="text-xs font-semibold normal-case text-muted-foreground">
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
                              <span className="mt-0.5 block text-muted-foreground">
                                {a.detalhe}
                              </span>
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
                  <TabelaComparativoMensal
                    atual={atual}
                    anterior={anterior}
                    acumulado={acumuladoAno}
                  />
                  <ComposicaoResultado
                    receitas={receitasPorCategoria}
                    operacionais={categoriasOperacionais}
                    receitaTotal={atual.receitaBruta}
                    saidaTotal={atual.deducoes + atual.custos + atual.despesas}
                  />
                </div>

                <div className="grid gap-5 xl:grid-cols-2">
                  <Bloco
                    titulo="Principais impactos do período"
                    className="print:break-inside-avoid"
                  >
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
                      Os impactos comparam o mês selecionado com o mês anterior e consideram efeito
                      no resultado operacional.
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
              </div>
            </details>
          </article>
        )}
      </main>
    </>
  );
}

function LogoClienteEditor({
  empresaId,
  empresaNome,
  logoUrl,
}: {
  empresaId: string;
  empresaNome: string;
  logoUrl: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const mutateData = useServerFn(mutateFinancialData);

  const salvarLogo = useMutation({
    mutationFn: (novaLogo: string | null) =>
      mutateData({ data: { action: "updateEmpresaLogo", empresaId, logoUrl: novaLogo } }),
    onSuccess: async (_, novaLogo) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["empresa", empresaId] }),
        queryClient.invalidateQueries({ queryKey: ["empresas"] }),
      ]);
      toast.success(novaLogo ? "Logo do cliente salva." : "Logo do cliente removida.");
    },
    onError: (erro) =>
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar a logo."),
  });

  async function selecionarArquivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!arquivo) return;
    try {
      salvarLogo.mutate(await otimizarLogo(arquivo));
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível processar a imagem.");
    }
  }

  return (
    <section className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 rounded-xl border bg-card p-4 shadow-card print:hidden">
      <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white p-2">
        {logoUrl ? (
          <img src={logoUrl} alt={`Logo ${empresaNome}`} className="h-full w-full object-contain" />
        ) : (
          <ImagePlus className="h-7 w-7 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-52 flex-1">
        <h2 className="text-sm font-semibold">Logo do cliente</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Esta logo pertence somente ao projeto {empresaNome} e será usada na capa do slide.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">PNG, JPG ou WEBP, com até 5 MB.</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={selecionarArquivo}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={logoUrl ? "outline" : "default"}
          disabled={salvarLogo.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {logoUrl ? <Pencil className="mr-2 h-4 w-4" /> : <ImagePlus className="mr-2 h-4 w-4" />}
          {logoUrl ? "Substituir logo" : "Cadastrar logo"}
        </Button>
        {logoUrl && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={salvarLogo.isPending}
            onClick={() =>
              window.confirm(`Remover a logo do projeto “${empresaNome}”?`) &&
              salvarLogo.mutate(null)
            }
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Excluir logo
          </Button>
        )}
      </div>
    </section>
  );
}

async function otimizarLogo(arquivo: File): Promise<string> {
  const tiposPermitidos = new Set(["image/png", "image/jpeg", "image/webp"]);
  if (!tiposPermitidos.has(arquivo.type)) throw new Error("Use uma imagem PNG, JPG ou WEBP.");
  if (arquivo.size > 5 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 5 MB.");

  const urlTemporaria = URL.createObjectURL(arquivo);
  try {
    const imagem = await new Promise<HTMLImageElement>((resolve, reject) => {
      const elemento = new Image();
      elemento.onload = () => resolve(elemento);
      elemento.onerror = () => reject(new Error("O arquivo de imagem não pôde ser lido."));
      elemento.src = urlTemporaria;
    });
    const limite = 700;
    const escala = Math.min(1, limite / Math.max(imagem.naturalWidth, imagem.naturalHeight));
    const largura = Math.max(1, Math.round(imagem.naturalWidth * escala));
    const altura = Math.max(1, Math.round(imagem.naturalHeight * escala));
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const contexto = canvas.getContext("2d");
    if (!contexto) throw new Error("Não foi possível preparar a imagem.");
    contexto.drawImage(imagem, 0, 0, largura, altura);
    const dataUrl = canvas.toDataURL("image/png");
    if (dataUrl.length > 1_500_000)
      throw new Error("A logo ficou muito grande. Tente uma imagem com dimensões menores.");
    return dataUrl;
  } finally {
    URL.revokeObjectURL(urlTemporaria);
  }
}

function ApresentacaoPreview({
  empresa,
  logoClienteUrl,
  periodo,
  atual,
  anterior,
  margemDesejada,
  evolucao,
  evolucaoDashboard,
  receitas,
  custos,
  impactosPositivos,
  impactosNegativos,
  alertas,
  resumo,
  acoes,
  layout,
  onLayoutChange,
}: {
  empresa: string;
  logoClienteUrl?: string | null;
  periodo: string;
  atual: ResultadoMes;
  anterior: ResultadoMes | undefined;
  margemDesejada: number;
  evolucao: Array<{
    mes: string;
    receita: number;
    resultado: number;
    resultadoBruto: number;
    resultadoLiquido: number;
    margem: number;
  }>;
  evolucaoDashboard: Array<{
    mes: string;
    receita: number;
    resultado: number;
    resultadoLiquido: number;
  }>;
  receitas: CategoriaResumo[];
  custos: CategoriaResumo[];
  impactosPositivos: Array<{ nome: string; efeito: number }>;
  impactosNegativos: Array<{ nome: string; efeito: number }>;
  alertas: Array<{ titulo: string; detalhe: string }>;
  resumo: string[];
  acoes: Array<{
    acao: string;
    responsavel?: string | null;
    prazo?: string | null;
    status: string;
  }>;
  layout: RelatorioPptxLayout;
  onLayoutChange: (layout: RelatorioPptxLayout) => void;
}) {
  const [slideAtivo, setSlideAtivo] = useState(1);
  const titulosSlides = [
    "Capa",
    "Dashboard financeiro",
    ...layout.graficos.map(tituloGraficoRelatorio),
    "Análise financeira",
    "Impactos do período",
    "Plano de ação",
  ];

  function alterarGrafico(posicao: number, grafico: GraficoRelatorioId) {
    const graficos = [...layout.graficos];
    graficos[posicao] = grafico;
    onLayoutChange({ graficos });
    setSlideAtivo(posicao + 3);
  }

  const graficoAtivo = slideAtivo >= 3 && slideAtivo <= 6 ? layout.graficos[slideAtivo - 3] : null;

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-card print:hidden">
      <div className="border-b px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold">Prévia da apresentação</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Esta composição e a ordem abaixo serão usadas no arquivo PPTX.
            </p>
          </div>
          <span className="rounded-full bg-info-soft px-3 py-1 text-xs font-semibold text-info">
            Formato 16:9 · 9 slides
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {layout.graficos.map((grafico, indice) => (
            <label key={indice} className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Gráfico do slide {indice + 3}
              <select
                value={grafico}
                onChange={(event) =>
                  alterarGrafico(indice, event.target.value as GraficoRelatorioId)
                }
                className="h-9 w-full rounded-md border bg-background px-3 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                {graficosRelatorio
                  .filter((opcao) => opcao.id !== "impactos")
                  .map((opcao) => (
                    <option
                      key={opcao.id}
                      value={opcao.id}
                      disabled={layout.graficos.some(
                        (selecionado, posicao) => posicao !== indice && selecionado === opcao.id,
                      )}
                    >
                      {opcao.label}
                    </option>
                  ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[190px_minmax(0,1fr)]">
        <div className="max-h-[650px] space-y-2 overflow-y-auto border-b bg-muted/30 p-3 xl:border-r xl:border-b-0">
          {titulosSlides.map((titulo, indice) => (
            <button
              key={`${titulo}-${indice}`}
              type="button"
              onClick={() => setSlideAtivo(indice + 1)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border p-2 text-left transition-colors",
                slideAtivo === indice + 1
                  ? "border-primary bg-primary/10"
                  : "border-transparent hover:border-border hover:bg-background",
              )}
            >
              <span className="flex aspect-video w-16 shrink-0 items-center justify-center rounded bg-[#07356b] text-[10px] font-bold text-white">
                {String(indice + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 text-xs font-medium leading-4">{titulo}</span>
            </button>
          ))}
        </div>

        <div className="bg-muted/20 p-3 sm:p-6">
          <div className="mx-auto aspect-video w-full max-w-[960px] overflow-hidden rounded-md bg-[#07356b] text-white shadow-2xl ring-1 ring-black/10">
            {slideAtivo === 1 ? (
              <PreviewCapa
                empresa={empresa}
                logoClienteUrl={logoClienteUrl ?? null}
                periodo={periodo}
              />
            ) : slideAtivo === 2 ? (
              <PreviewDashboard atual={atual} evolucao={evolucaoDashboard} periodo={periodo} />
            ) : graficoAtivo ? (
              <PreviewGrafico
                grafico={graficoAtivo}
                numero={slideAtivo}
                periodo={periodo}
                atual={atual}
                anterior={anterior}
                margemDesejada={margemDesejada}
                evolucao={evolucao}
                receitas={receitas}
                custos={custos}
                impactos={[...impactosPositivos, ...impactosNegativos]}
              />
            ) : slideAtivo === 7 ? (
              <PreviewAnalise periodo={periodo} alertas={alertas} />
            ) : slideAtivo === 8 ? (
              <PreviewImpactos
                periodo={periodo}
                positivos={impactosPositivos}
                negativos={impactosNegativos}
              />
            ) : slideAtivo === 9 ? (
              <PreviewPlano periodo={periodo} acoes={acoes} />
            ) : (
              <PreviewSlideFinal
                numero={slideAtivo}
                titulo={titulosSlides[slideAtivo - 1] ?? "Relatório"}
                periodo={periodo}
              />
            )}
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Slide {slideAtivo} de {titulosSlides.length} · {titulosSlides[slideAtivo - 1]}
          </p>
        </div>
      </div>
    </section>
  );
}

function PreviewMoldura({
  titulo,
  periodo,
  numero,
  children,
}: {
  titulo: string;
  periodo: string;
  numero: number;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex h-full flex-col border-t-4 border-[#1479d2] px-[4.5%] pb-[3%] pt-[3%]">
      <div className="flex items-center justify-between gap-4 border-b border-white/15 pb-[1.6%]">
        <h3 className="truncate text-[clamp(12px,2.2vw,26px)] font-bold uppercase tracking-tight">
          {titulo}
        </h3>
        <span className="shrink-0 text-[clamp(6px,.8vw,10px)] text-blue-100">{periodo}</span>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      <span className="absolute right-[4.5%] bottom-[2.5%] text-[clamp(6px,.8vw,10px)] font-bold">
        {String(numero).padStart(2, "0")}
      </span>
    </div>
  );
}

function PreviewCapa({
  empresa,
  logoClienteUrl,
  periodo,
}: {
  empresa: string;
  logoClienteUrl?: string | null;
  periodo: string;
}) {
  const periodoTitulo = periodo.replace(/\s+de\s+(\d{4})$/i, "/$1");
  const iniciais = empresa
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte.charAt(0))
    .join("")
    .toUpperCase();
  return (
    <div className="relative flex h-full flex-col items-center overflow-hidden px-[3%] text-center">
      <div className="absolute inset-x-0 top-0 grid h-[1.7%] grid-cols-4">
        <span className="bg-[#f04f78]" />
        <span className="bg-[#f2c94c]" />
        <span className="bg-[#28b78d]" />
        <span className="bg-[#1479d2]" />
      </div>
      <p className="mt-[15%] text-[clamp(18px,3.5vw,42px)] font-bold tracking-tight">
        Relatório Financeiro {periodoTitulo}
      </p>
      <p className="mt-[7%] border-b-2 border-white pb-[1%] text-[clamp(9px,1.7vw,20px)]">
        <strong className="text-[#f2c94c]">CLAREZA</strong> que gera <strong>RESULTADO!</strong>
      </p>
      <div className="grid h-[31%] w-full max-w-[94%] grid-cols-2 border-b-2 border-white">
        <div className="flex items-center justify-end border-r-2 border-white pr-[9%]">
          <img src="/logobranca.png" alt="VG Resultados" className="w-[32%] object-contain" />
        </div>
        <div className="flex items-center justify-start pl-[9%]">
          {logoClienteUrl ? (
            <img
              src={logoClienteUrl}
              alt={`Logo ${empresa}`}
              className="h-[65%] w-[34%] object-contain"
            />
          ) : (
            <div className="flex aspect-square h-[62%] flex-col items-center justify-center rounded-lg border border-white/40 bg-white/10 px-[5%]">
              <strong className="text-[clamp(10px,2vw,24px)]">{iniciais || "LOGO"}</strong>
              <span className="mt-[4%] line-clamp-2 text-[clamp(4px,.55vw,7px)] leading-tight text-blue-100">
                {empresa}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewDashboard({
  atual,
  evolucao,
  periodo,
}: {
  atual: ResultadoMes;
  evolucao: Array<{
    mes: string;
    receita: number;
    resultado: number;
    resultadoLiquido: number;
  }>;
  periodo: string;
}) {
  return (
    <PreviewMoldura titulo="Dashboard financeiro" periodo={periodo} numero={2}>
      <div className="mt-[3%] grid grid-cols-4 gap-[1.5%]">
        {[
          ["Receita operacional", atual.receitaBruta],
          ["Custos operacionais", -(atual.deducoes + atual.custos)],
          ["Despesas operacionais", -atual.despesas],
          ["Resultado líquido", atual.resultadoLiquido],
        ].map(([label, valor]) => (
          <div key={String(label)} className="rounded bg-[#0a427d] p-[7%] ring-1 ring-white/10">
            <p className="truncate text-[clamp(5px,.8vw,9px)] font-bold uppercase text-blue-100">
              {label}
            </p>
            <p className="mt-[8%] truncate text-[clamp(8px,1.55vw,18px)] font-bold">
              {brl(Number(valor), true)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-[3%] h-[55%] rounded bg-[#0a427d] p-[2.5%] ring-1 ring-white/10">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[clamp(7px,1.15vw,14px)] font-bold uppercase">Evolução comparativa</p>
          <div className="flex gap-3 text-[clamp(4px,.6vw,8px)] text-blue-100">
            {[
              ["Receita op.", "#73c76b"],
              ["Resultado op.", "#26b9e8"],
              ["Resultado líq.", "#f04f78"],
            ].map(([label, cor]) => (
              <span key={label} className="inline-flex items-center gap-1">
                <i className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cor }} />
                {label}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-[1%] h-[82%]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={evolucao} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2c6094" />
              <ReferenceLine y={0} stroke="#ffffff" strokeOpacity={0.35} />
              <XAxis
                dataKey="mes"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#ddebfa", fontSize: 8 }}
              />
              <YAxis
                tickFormatter={(valor) => brl(Number(valor), true)}
                tickLine={false}
                axisLine={false}
                width={58}
                tick={{ fill: "#ddebfa", fontSize: 7 }}
              />
              <Tooltip
                formatter={(valor, nome) => [
                  brl(Number(valor)),
                  nome === "receita"
                    ? "Receita operacional"
                    : nome === "resultado"
                      ? "Resultado operacional"
                      : "Resultado líquido",
                ]}
                labelFormatter={(rotulo) => String(rotulo)}
                contentStyle={{
                  background: "#063b77",
                  border: "1px solid #2c6094",
                  borderRadius: 6,
                  color: "#ffffff",
                  fontSize: 10,
                }}
                itemStyle={{ color: "#ffffff" }}
                labelStyle={{ color: "#ddebfa", fontWeight: 700 }}
              />
              <Line
                type="monotone"
                dataKey="receita"
                stroke="#73c76b"
                strokeWidth={2.5}
                dot={{ r: 2.5, fill: "#73c76b" }}
              />
              <Line
                type="monotone"
                dataKey="resultado"
                stroke="#26b9e8"
                strokeWidth={2.5}
                dot={{ r: 2.5, fill: "#26b9e8" }}
              />
              <Line
                type="monotone"
                dataKey="resultadoLiquido"
                stroke="#f04f78"
                strokeWidth={2.5}
                dot={{ r: 2.5, fill: "#f04f78" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </PreviewMoldura>
  );
}

function insightsPreviewGrafico({
  grafico,
  atual,
  anterior,
  margemDesejada,
  evolucao,
  receitas,
  custos,
}: {
  grafico: GraficoRelatorioId;
  atual: ResultadoMes;
  anterior: ResultadoMes | undefined;
  margemDesejada: number;
  evolucao: Array<{ mes: string; receita: number }>;
  receitas: CategoriaResumo[];
  custos: CategoriaResumo[];
}) {
  if (grafico === "receitas_categoria" || grafico === "custos_categoria") {
    const itens = grafico === "receitas_categoria" ? receitas : custos;
    const total = itens.reduce((soma, item) => soma + Math.abs(item.valor), 0);
    const lider = itens[0];
    const top3 = itens.slice(0, 3).reduce((soma, item) => soma + Math.abs(item.valor), 0);
    const textos: string[] = [];
    if (lider) {
      textos.push(
        `${rotuloCategoriaRelatorio(lider.nome)} concentra ${pct((Math.abs(lider.valor) / Math.max(total, 1)) * 100)} do total.`,
      );
      if (lider.valorAnterior !== undefined && lider.valorAnterior !== 0) {
        const delta = variacao(lider.valor, lider.valorAnterior);
        textos.push(
          delta === null
            ? "A principal categoria não possuía base comparável no mês anterior."
            : `A principal categoria ${delta >= 0 ? "cresceu" : "recuou"} ${pct(Math.abs(delta))} frente ao mês anterior.`,
        );
      }
    }
    if (itens.length >= 3) {
      textos.push(`As três maiores concentram ${pct((top3 / Math.max(total, 1)) * 100)} do total.`);
    }
    return textos.length ? textos : ["Sem base suficiente para uma leitura comparativa."];
  }

  if (grafico === "receita_mensal") {
    const textos: string[] = [];
    if (anterior) {
      const delta = variacao(atual.receitaBruta, anterior.receitaBruta);
      textos.push(
        delta === null
          ? `Não havia receita em ${mesesCurtos[anterior.mes]} para calcular a variação.`
          : `A receita ${delta >= 0 ? "cresceu" : "recuou"} ${pct(Math.abs(delta))} frente a ${mesesCurtos[anterior.mes]}.`,
      );
    }
    const ativos = evolucao.filter((item) => item.receita !== 0);
    const melhor = [...ativos].sort((a, b) => b.receita - a.receita)[0];
    if (melhor && evolucao.length > 1) textos.push(`Maior receita do período: ${melhor.mes}.`);
    return textos.length ? textos : ["Sem mês anterior disponível para comparação."];
  }

  if (grafico === "resultados") {
    const textos = [
      `Conversão operacional de ${pct(atual.margemOperacional)} sobre a receita.`,
      `Diferença entre resultado bruto e operacional: ${brl(atual.resultadoBruto - atual.resultadoOperacional, true)}.`,
    ];
    if (anterior) {
      const delta = variacao(atual.resultadoOperacional, anterior.resultadoOperacional);
      textos.push(
        delta === null
          ? "O mês anterior não oferece base percentual para o resultado operacional."
          : `O resultado operacional ${delta >= 0 ? "melhorou" : "recuou"} ${pct(Math.abs(delta))} frente ao mês anterior.`,
      );
    }
    return textos;
  }

  const distancia = atual.margemOperacional - margemDesejada;
  const textos = [
    `Margem ${distancia >= 0 ? "acima" : "abaixo"} da meta em ${formatarPontos(Math.abs(distancia))}.`,
  ];
  if (anterior) {
    const delta = atual.margemOperacional - anterior.margemOperacional;
    textos.push(
      `Na comparação mensal, a margem ${delta >= 0 ? "avançou" : "recuou"} ${formatarPontos(Math.abs(delta))}.`,
    );
  }
  return textos;
}

function PreviewGrafico({
  grafico,
  numero,
  periodo,
  atual,
  anterior,
  margemDesejada,
  evolucao,
  receitas,
  custos,
  impactos,
}: {
  grafico: GraficoRelatorioId;
  numero: number;
  periodo: string;
  atual: ResultadoMes;
  anterior: ResultadoMes | undefined;
  margemDesejada: number;
  evolucao: Array<{
    mes: string;
    receita: number;
    resultadoBruto: number;
    resultado: number;
    resultadoLiquido: number;
    margem: number;
  }>;
  receitas: CategoriaResumo[];
  custos: CategoriaResumo[];
  impactos: Array<{ nome: string; efeito: number }>;
}) {
  let itens: Array<{ nome: string; valor: number }> = [];
  if (grafico === "receitas_categoria")
    itens = receitas.map((item) => ({ nome: item.nome, valor: item.valor }));
  if (grafico === "custos_categoria")
    itens = custos.map((item) => ({ nome: item.nome, valor: item.valor }));
  if (grafico === "receita_mensal")
    itens =
      evolucao.length === 1 && anterior
        ? [
            { nome: mesesCurtos[anterior.mes] ?? "Anterior", valor: anterior.receitaBruta },
            { nome: evolucao[0]?.mes ?? "Atual", valor: atual.receitaBruta },
          ]
        : evolucao.map((item) => ({ nome: item.mes, valor: item.receita }));
  if (grafico === "resultados")
    itens = anterior
      ? [
          { nome: "Operacional anterior", valor: anterior.resultadoOperacional },
          { nome: "Operacional atual", valor: atual.resultadoOperacional },
          { nome: "Líquido anterior", valor: anterior.resultadoLiquido },
          { nome: "Líquido atual", valor: atual.resultadoLiquido },
        ]
      : [
          { nome: "Resultado bruto", valor: atual.resultadoBruto },
          { nome: "Resultado operacional", valor: atual.resultadoOperacional },
          { nome: "Resultado líquido", valor: atual.resultadoLiquido },
        ];
  if (grafico === "margem_meta")
    itens = [
      { nome: "Margem atual", valor: atual.margemOperacional },
      { nome: "Meta", valor: margemDesejada },
    ];
  if (grafico === "impactos")
    itens = impactos.map((item) => ({ nome: item.nome, valor: item.efeito }));
  const insights = insightsPreviewGrafico({
    grafico,
    atual,
    anterior,
    margemDesejada,
    evolucao,
    receitas,
    custos,
  });
  return (
    <PreviewMoldura titulo={tituloGraficoRelatorio(grafico)} periodo={periodo} numero={numero}>
      <div className="mt-[3%] grid grid-cols-3 gap-[2%]">
        {[
          ["Receita operacional", atual.receitaBruta],
          ["Resultado operacional", atual.resultadoOperacional],
          ["Margem operacional", `${pct(atual.margemOperacional)}`],
        ].map(([label, valor]) => (
          <div
            key={String(label)}
            className="rounded bg-[#0a427d] px-[6%] py-[4%] ring-1 ring-white/10"
          >
            <p className="text-[clamp(5px,.75vw,9px)] font-bold uppercase text-blue-100">{label}</p>
            <p className="mt-[3%] truncate text-[clamp(8px,1.35vw,16px)] font-bold">
              {typeof valor === "number" ? brl(valor, true) : valor}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-[3%] grid h-[57%] grid-cols-[2.2fr_1fr] gap-[2%]">
        <div className="rounded bg-[#0a427d] p-[3%] ring-1 ring-white/10">
          <p className="text-[clamp(7px,1.05vw,13px)] font-bold uppercase">
            {tituloGraficoRelatorio(grafico)}
          </p>
          {grafico === "margem_meta" ? (
            <PreviewMargem margem={atual.margemOperacional} meta={margemDesejada} />
          ) : (
            <PreviewBarras itens={itens} limite={grafico === "receita_mensal" ? 12 : 7} />
          )}
        </div>
        <div className="rounded bg-[#063b77] p-[6%] ring-1 ring-white/10">
          <p className="border-b border-[#f2c94c] pb-[4%] text-[clamp(7px,1.05vw,13px)] font-bold uppercase">
            Leitura do período
          </p>
          <ul className="mt-[6%] space-y-[8%] text-[clamp(5px,.75vw,9px)] leading-snug text-blue-100">
            {insights.map((texto, indice) => (
              <li key={`${texto}-${indice}`}>• {texto}</li>
            ))}
          </ul>
        </div>
      </div>
    </PreviewMoldura>
  );
}

function PreviewBarras({
  itens,
  percentual,
  limite = 7,
}: {
  itens: Array<{ nome: string; valor: number }>;
  percentual?: boolean;
  limite?: number;
}) {
  const dados = itens.slice(0, limite);
  const maximo = Math.max(...dados.map((item) => Math.abs(item.valor)), 1);
  const cores = ["#26b9e8", "#1479d2", "#28b78d", "#f2c94c", "#f04f78", "#73c76b", "#7d9fe8"];
  return (
    <div className="mt-[3%] flex h-[78%] items-end gap-[2%] border-b border-white/25 px-[1%]">
      {dados.map((item, indice) => (
        <div
          key={`${item.nome}-${indice}`}
          className="flex h-full min-w-0 flex-1 flex-col justify-end text-center"
        >
          <span className="mb-1 truncate text-[clamp(4px,.65vw,8px)] font-bold">
            {percentual ? pct(item.valor) : brl(Math.abs(item.valor), true)}
          </span>
          <div
            className="mx-auto w-[64%] min-w-2 rounded-t-sm"
            style={{
              height: `${Math.max(5, (Math.abs(item.valor) / maximo) * 68)}%`,
              backgroundColor: cores[indice % cores.length],
            }}
          />
          <span className="mt-1 line-clamp-2 h-[2.1em] text-[clamp(4px,.6vw,8px)] leading-tight">
            {rotuloCategoriaRelatorio(item.nome)}
          </span>
        </div>
      ))}
    </div>
  );
}

function PreviewMargem({ margem, meta }: { margem: number; meta: number }) {
  const diferenca = margem - meta;
  const maximo = Math.max(Math.abs(margem), Math.abs(meta), 10) * 1.2;
  const atingimento = meta > 0 ? (margem / meta) * 100 : 0;
  return (
    <div className="mt-[4%] grid h-[76%] grid-cols-[1.25fr_.75fr] gap-[5%]">
      <div className="flex items-end justify-center gap-[12%] border-b border-white/25 px-[6%]">
        {[
          { nome: "Margem atual", valor: margem, cor: diferenca >= 0 ? "#28b78d" : "#f04f78" },
          { nome: "Meta", valor: meta, cor: "#f2c94c" },
        ].map((item) => (
          <div key={item.nome} className="flex h-full w-[34%] flex-col justify-end text-center">
            <span className="mb-1 text-[clamp(6px,.85vw,10px)] font-bold">{pct(item.valor)}</span>
            <div
              className="mx-auto w-[62%] rounded-t-sm"
              style={{
                height: `${Math.max(6, (Math.abs(item.valor) / maximo) * 68)}%`,
                backgroundColor: item.cor,
              }}
            />
            <span className="mt-1 h-[2.1em] text-[clamp(5px,.7vw,9px)] font-semibold leading-tight">
              {item.nome}
            </span>
          </div>
        ))}
      </div>
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border text-center",
          diferenca >= 0 ? "border-[#28b78d] bg-[#063b77]" : "border-[#f04f78] bg-[#063b77]",
        )}
      >
        <p className="text-[clamp(5px,.7vw,9px)] font-bold uppercase text-blue-100">
          {diferenca >= 0 ? "Meta superada" : "Distância da meta"}
        </p>
        <p
          className={cn(
            "mt-[7%] text-[clamp(12px,2.2vw,27px)] font-bold",
            diferenca >= 0 ? "text-[#28b78d]" : "text-[#f04f78]",
          )}
        >
          {formatarPontos(diferenca)}
        </p>
        <p className="text-[clamp(4px,.6vw,8px)] text-blue-100">em relação à meta</p>
        <p className="mt-[12%] text-[clamp(5px,.7vw,9px)] font-semibold">
          Atingimento: {pct(atingimento)}
        </p>
      </div>
    </div>
  );
}

function PreviewAnalise({
  periodo,
  alertas,
}: {
  periodo: string;
  alertas: Array<{ titulo: string; detalhe: string }>;
}) {
  return (
    <PreviewMoldura titulo="Análise financeira" periodo={periodo} numero={7}>
      <div className="mt-[3%] grid h-[78%] grid-cols-[1.8fr_1fr] gap-[2%]">
        <div className="rounded bg-[#063b77] p-[4%] ring-1 ring-white/10">
          <h4 className="border-b border-[#f2c94c] pb-[2%] text-[clamp(7px,1.2vw,15px)] font-bold uppercase">
            Diagnóstico do período
          </h4>
          <div className="mt-[4%] space-y-[2.5%]">
            {alertas.length ? (
              alertas.slice(0, 5).map((alerta, indice) => (
                <div
                  key={`${alerta.titulo}-${indice}`}
                  className="grid grid-cols-[10px_1fr_1.8fr] items-center gap-[2%] rounded bg-[#0a427d] px-[3%] py-[2%] ring-1 ring-white/10"
                >
                  <span
                    className={cn(
                      "aspect-square rounded-full",
                      indice === 0 ? "bg-[#f04f78]" : "bg-[#f2c94c]",
                    )}
                  />
                  <strong className="text-[clamp(5px,.75vw,10px)] leading-tight">
                    {alerta.titulo}
                  </strong>
                  <span className="line-clamp-2 text-[clamp(4px,.65vw,9px)] leading-tight text-blue-100">
                    {alerta.detalhe}
                  </span>
                </div>
              ))
            ) : (
              <p className="pt-[20%] text-center text-[clamp(6px,1vw,13px)] text-blue-100">
                Nenhum alerta relevante no período selecionado.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col rounded bg-[#063b77] p-[6%] ring-1 ring-white/10">
          <h4 className="border-b border-[#f2c94c] pb-[4%] text-[clamp(7px,1.2vw,15px)] font-bold uppercase">
            Escopo do diagnóstico
          </h4>
          <ul className="mt-[7%] flex-1 space-y-[7%] text-[clamp(5px,.75vw,10px)] leading-snug text-blue-100">
            <li>• {alertas.length} alertas relevantes identificados</li>
            <li>• Evidências ordenadas por prioridade para acompanhamento</li>
            <li>• Detalhamento restrito aos pontos que exigem decisão</li>
          </ul>
          <div
            className={cn(
              "rounded px-[4%] py-[4%] text-center",
              alertas.length === 0 ? "bg-[#28b78d]" : "bg-[#f04f78]",
            )}
          >
            <p className="text-[clamp(4px,.65vw,8px)] font-bold uppercase">
              Itens para acompanhamento
            </p>
            <p className="text-[clamp(7px,1.15vw,14px)] font-bold">{alertas.length}</p>
          </div>
        </div>
      </div>
    </PreviewMoldura>
  );
}

function PreviewImpactos({
  periodo,
  positivos,
  negativos,
}: {
  periodo: string;
  positivos: Array<{ nome: string; efeito: number }>;
  negativos: Array<{ nome: string; efeito: number }>;
}) {
  const maior = Math.max(
    1,
    ...positivos.map((item) => Math.abs(item.efeito)),
    ...negativos.map((item) => Math.abs(item.efeito)),
  );
  const coluna = (
    titulo: string,
    itens: Array<{ nome: string; efeito: number }>,
    cor: string,
    vazio: string,
  ) => (
    <div className="rounded bg-[#063b77] p-[5%] ring-1 ring-white/10">
      <h4 className="border-b border-[#f2c94c] pb-[3%] text-[clamp(7px,1.2vw,15px)] font-bold uppercase">
        {titulo}
      </h4>
      {itens.length ? (
        <div className="mt-[7%] space-y-[6%]">
          {itens.slice(0, 5).map((item) => (
            <div key={`${titulo}-${item.nome}`}>
              <div className="flex justify-between gap-2 text-[clamp(4px,.7vw,9px)]">
                <span className="truncate">{item.nome}</span>
                <strong>{brl(item.efeito, true)}</strong>
              </div>
              <div className="mt-[2%] h-[clamp(5px,.75vw,9px)] rounded bg-white/10">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${Math.max(4, (Math.abs(item.efeito) / maior) * 100)}%`,
                    background: cor,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="pt-[30%] text-center text-[clamp(6px,1vw,13px)] text-blue-100">{vazio}</p>
      )}
    </div>
  );

  return (
    <PreviewMoldura titulo="Impactos do período" periodo={periodo} numero={8}>
      <div className="mt-[3%] grid h-[78%] grid-cols-2 gap-[2%]">
        {coluna(
          "Melhoraram o resultado",
          positivos,
          "#28b78d",
          "Nenhum impacto positivo relevante.",
        )}
        {coluna(
          "Pressionaram o resultado",
          negativos,
          "#f04f78",
          "Nenhum impacto negativo relevante.",
        )}
      </div>
    </PreviewMoldura>
  );
}

function PreviewPlano({
  periodo,
  acoes,
}: {
  periodo: string;
  acoes: Array<{
    acao: string;
    responsavel?: string | null;
    prazo?: string | null;
    status: string;
  }>;
}) {
  return (
    <PreviewMoldura titulo="Plano de ação" periodo={periodo} numero={9}>
      <h4 className="mt-[3%] text-[clamp(7px,1.2vw,15px)] font-bold uppercase">
        Próximos passos prioritários
      </h4>
      <div className="mt-[2%] overflow-hidden rounded ring-1 ring-white/15">
        <div className="grid grid-cols-[3fr_1.1fr_.8fr_1.1fr] bg-[#0d559c] px-[2%] py-[1.5%] text-[clamp(4px,.65vw,8px)] font-bold uppercase">
          <span>Ação</span>
          <span>Responsável</span>
          <span>Prazo</span>
          <span>Status</span>
        </div>
        {acoes.length ? (
          acoes.slice(0, 8).map((acao, indice) => (
            <div
              key={`${acao.acao}-${indice}`}
              className="grid grid-cols-[3fr_1.1fr_.8fr_1.1fr] items-center border-t border-white/10 bg-[#0a427d] px-[2%] py-[1.5%] text-[clamp(4px,.65vw,8px)]"
            >
              <span className="truncate pr-2">{acao.acao}</span>
              <span className="truncate pr-2">{acao.responsavel || "—"}</span>
              <span>{acao.prazo || "—"}</span>
              <span className="truncate">{acao.status}</span>
            </div>
          ))
        ) : (
          <p className="bg-[#0a427d] py-[16%] text-center text-[clamp(7px,1.2vw,15px)] text-blue-100">
            Nenhuma ação em aberto para o período selecionado.
          </p>
        )}
      </div>
    </PreviewMoldura>
  );
}

function PreviewSlideFinal({
  numero,
  titulo,
  periodo,
}: {
  numero: number;
  titulo: string;
  periodo: string;
}) {
  return (
    <PreviewMoldura titulo={titulo} periodo={periodo} numero={numero}>
      <div className="mt-[5%] grid h-[72%] grid-cols-2 gap-[3%]">
        <div className="rounded bg-[#0a427d] p-[5%] ring-1 ring-white/10">
          <div className="h-3 w-2/5 rounded bg-white/80" />
          <div className="mt-[7%] space-y-[5%]">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-[13%] rounded bg-white/10 ring-1 ring-white/10" />
            ))}
          </div>
        </div>
        <div className="rounded bg-[#063b77] p-[6%] ring-1 ring-white/10">
          <div className="h-3 w-1/2 rounded bg-white/80" />
          <div className="mt-[9%] space-y-[7%]">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-2 rounded bg-white/15" />
            ))}
          </div>
        </div>
      </div>
    </PreviewMoldura>
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
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold normal-case text-muted-foreground">
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
            <p className="text-xs font-semibold normal-case opacity-80">Diagnóstico</p>
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
      <p className="text-xs font-semibold normal-case text-muted-foreground">{titulo}</p>
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
            <tr className="border-b bg-muted/50 text-xs normal-case text-muted-foreground">
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
  valorAnterior?: number;
};

function ehChicagoBarbearia(nomeEmpresa: string | null | undefined): boolean {
  const nomeNormalizado = String(nomeEmpresa ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return nomeNormalizado.includes("chicago") && nomeNormalizado.includes("barbearia");
}

function ehCategoriaReceitaLegadaChicago(nomeCategoria: string): boolean {
  return /^1[.\s-]*1(?:[.\s-]|$)/.test(nomeCategoria.trim());
}

function topCategorias(
  linhas: ReturnType<typeof agregarPorCategoria>,
  mesesVisiveis: number[],
  grupos: GrupoDre[],
  linhasAnoAnterior: ReturnType<typeof agregarPorCategoria> = [],
): CategoriaResumo[] {
  return linhas
    .filter((linha) => grupos.includes(linha.grupo))
    .map((linha) => ({
      nome: linha.nome,
      grupo: linha.grupo,
      valor: mesesVisiveis.reduce((s, mes) => s + Math.abs(linha.valores[mes] ?? 0), 0),
      ...(mesesVisiveis.length === 1 && mesesVisiveis[0] !== undefined
        ? {
            valorAnterior: Math.abs(
              mesesVisiveis[0] > 0
                ? (linha.valores[mesesVisiveis[0] - 1] ?? 0)
                : (linhasAnoAnterior.find(
                    (anterior) => anterior.nome === linha.nome && anterior.grupo === linha.grupo,
                  )?.valores[11] ?? 0),
            ),
          }
        : {}),
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
      acoesSociais: 0,
      distribuicaoCotistas: 0,
      ajustesCotistas: 0,
      resultadoLiquidoComDistrib: 0,
      resultadoOperacionalCotistas: 0,
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
    `A operação encerrou o período com receita operacional de ${brl(atual.receitaBruta)} e resultado operacional de ${brl(atual.resultadoOperacional)}, equivalente a uma margem de ${pct(atual.margemOperacional)}.`,
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
