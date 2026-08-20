import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { Bloco, Kpi, SemDados, SemEmpresa } from "@/components/ui-blocos";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useApp } from "@/lib/app-context";
import { filtrarLancamentosPorCentroCusto } from "@/lib/centro-custo";
import { useCategorias, useLancamentos } from "@/lib/data";
import { agregarPorCategoria, calcularDre } from "@/lib/dre";
import {
  filtrarLancamentosPorMeses,
  mesesDoPeriodoFiltro,
  periodoFiltroLabel,
  totalizarResultadosPeriodo,
} from "@/lib/periodo";
import { brl, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ponto-equilibrio")({
  head: () => ({
    meta: [
      { title: "Ponto de Equilíbrio | Ecossistema Financeiro BPO" },
      {
        name: "description",
        content:
          "Cálculo do ponto de equilíbrio com margem de contribuição e simulação de faturamento necessário.",
      },
      { property: "og:title", content: "Ponto de Equilíbrio | Ecossistema Financeiro BPO" },
      {
        property: "og:description",
        content: "Quanto a empresa precisa faturar para pagar a estrutura e gerar lucro.",
      },
    ],
  }),
  component: PontoEquilibrioPage,
});

function PontoEquilibrioPage() {
  const { empresaId, ano, mes, periodo, centroCusto } = useApp();
  const { data: lancamentos = [], isLoading } = useLancamentos(empresaId, ano);
  const { data: categorias = [] } = useCategorias(empresaId);
  const [lucroDesejado, setLucroDesejado] = useState(0);

  const lancamentosFiltrados = useMemo(
    () => filtrarLancamentosPorCentroCusto(lancamentos, centroCusto),
    [lancamentos, centroCusto],
  );
  const mesesPeriodo = useMemo(() => mesesDoPeriodoFiltro(periodo, mes), [periodo, mes]);
  const periodoLabel = periodoFiltroLabel(periodo, mes);
  const lancamentosPeriodo = useMemo(
    () => filtrarLancamentosPorMeses(lancamentosFiltrados, mesesPeriodo),
    [lancamentosFiltrados, mesesPeriodo],
  );
  const resultados = useMemo(
    () => calcularDre(lancamentosPeriodo, categorias),
    [lancamentosPeriodo, categorias],
  );
  const linhas = useMemo(
    () => agregarPorCategoria(lancamentosPeriodo, categorias),
    [lancamentosPeriodo, categorias],
  );
  const atual = useMemo(
    () => totalizarResultadosPeriodo(resultados, mesesPeriodo),
    [resultados, mesesPeriodo],
  );

  const saidas = linhas.filter((l) => l.grupo === "custos" || l.grupo === "despesas");
  const fixos = saidas.reduce(
    (s, l) =>
      s +
      (l.classificacao === "fixo"
        ? mesesPeriodo.reduce((total, mesIndex) => total + Math.abs(l.valores[mesIndex] ?? 0), 0)
        : 0),
    0,
  );
  const variaveis = saidas.reduce(
    (s, l) =>
      s +
      (l.classificacao === "variavel"
        ? mesesPeriodo.reduce((total, mesIndex) => total + Math.abs(l.valores[mesIndex] ?? 0), 0)
        : 0),
    0,
  );

  const receita = atual.receitaBruta;
  const margemContribuicaoValor = receita - variaveis;
  const indiceMC = receita ? margemContribuicaoValor / receita : 0;
  const pontoEquilibrio = indiceMC > 0 ? fixos / indiceMC : 0;
  const pontoComLucro = indiceMC > 0 ? (fixos + lucroDesejado) / indiceMC : 0;
  const margemSeguranca =
    receita && pontoEquilibrio ? ((receita - pontoEquilibrio) / receita) * 100 : 0;
  const faturamentoDiario = pontoEquilibrio / Math.max(mesesPeriodo.length * 30, 30);

  const serie = useMemo(() => {
    const pontos: { receita: number; resultado: number }[] = [];
    const teto = Math.max(receita, pontoEquilibrio) * 1.6 || 10000;
    for (let i = 0; i <= 12; i++) {
      const r = (teto / 12) * i;
      pontos.push({ receita: r, resultado: r * indiceMC - fixos });
    }
    return pontos;
  }, [receita, pontoEquilibrio, indiceMC, fixos]);

  const atingiu = receita >= pontoEquilibrio && pontoEquilibrio > 0;

  return (
    <>
      <TopBar
        titulo="Ponto de Equilíbrio"
        descricao={`${periodoLabel} de ${ano} · regime de caixa`}
      />
      <main className="space-y-5 p-6">
        {!empresaId ? (
          <SemEmpresa />
        ) : isLoading ? (
          <SemDados mensagem="Carregando dados..." />
        ) : !atual.temMovimento ? (
          <SemDados mensagem="Sem lançamentos no período selecionado." />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi
                titulo="Ponto de equilíbrio"
                valor={pontoEquilibrio}
                legenda={`faturamento mínimo · ${brl(faturamentoDiario, true)}/dia`}
                tom={atingiu ? "positivo" : "negativo"}
              />
              <Kpi
                titulo="Receita do período"
                valor={receita}
                legenda={atingiu ? "acima do ponto de equilíbrio" : "abaixo do ponto de equilíbrio"}
                tom={atingiu ? "positivo" : "negativo"}
              />
              <Kpi
                titulo="Margem de contribuição"
                valor={margemContribuicaoValor}
                legenda={`índice de ${pct(indiceMC * 100)}`}
                tom="neutro"
              />
              <Kpi
                titulo="Estrutura do período"
                valor={fixos}
                legenda="base do ponto de equilíbrio"
                tom="atencao"
              />
            </div>

            <div
              className={cn(
                "rounded-xl px-5 py-4 text-sm font-medium",
                atingiu ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative",
              )}
            >
              {atingiu
                ? `A empresa superou o ponto de equilíbrio em ${brl(receita - pontoEquilibrio)}, com margem de segurança de ${pct(margemSeguranca)}.`
                : `Faltaram ${brl(pontoEquilibrio - receita)} de receita para cobrir a estrutura do período.`}
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              <Bloco titulo="Curva de resultado por faturamento" className="xl:col-span-2">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={serie}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        dataKey="receita"
                        tickFormatter={(v) => brl(Number(v), true)}
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                      />
                      <YAxis
                        tickFormatter={(v) => brl(Number(v), true)}
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        width={80}
                      />
                      <Tooltip
                        formatter={(v) => brl(Number(v))}
                        labelFormatter={(v) => `Receita ${brl(Number(v))}`}
                      />
                      <ReferenceLine y={0} stroke="var(--muted-foreground)" />
                      <ReferenceLine
                        x={pontoEquilibrio}
                        stroke="var(--warning)"
                        strokeDasharray="4 4"
                        label={{ value: "Equilíbrio", fontSize: 11, fill: "var(--warning)" }}
                      />
                      <ReferenceLine
                        x={receita}
                        stroke="var(--info)"
                        strokeDasharray="4 4"
                        label={{ value: "Receita atual", fontSize: 11, fill: "var(--info)" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="resultado"
                        stroke="var(--positive)"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Bloco>

              <Bloco titulo="Simulador de meta">
                <div className="space-y-2">
                  <Label htmlFor="lucro">Lucro desejado no período (R$)</Label>
                  <Input
                    id="lucro"
                    type="number"
                    min={0}
                    step={1000}
                    value={lucroDesejado}
                    onChange={(e) => setLucroDesejado(Number(e.target.value) || 0)}
                  />
                </div>
                <dl className="mt-5 space-y-3 text-sm">
                  <Linha rotulo="Faturamento necessário" valor={brl(pontoComLucro)} forte />
                  <Linha
                    rotulo="Diferença para a receita atual"
                    valor={brl(Math.max(pontoComLucro - receita, 0))}
                  />
                  <Linha rotulo="Meta diária (30 dias)" valor={brl(pontoComLucro / 30)} />
                  <Linha rotulo="Meta semanal" valor={brl(pontoComLucro / 4.3)} />
                  <Linha rotulo="Índice de margem de contribuição" valor={pct(indiceMC * 100)} />
                </dl>
                <p className="mt-4 text-xs text-muted-foreground">
                  Cálculo: (estrutura do período + lucro desejado) ÷ índice de margem de
                  contribuição.
                </p>
              </Bloco>
            </div>

            <Bloco titulo="Estrutura detalhada">
              <div className="-mx-5 -mb-5 overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-5 py-2 text-left font-medium">Categoria</th>
                      <th className="px-3 py-2 text-left font-medium">Grupo</th>
                      <th className="px-3 py-2 text-right font-medium">Valor no período</th>
                      <th className="px-5 py-2 text-right font-medium">% da estrutura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saidas
                      .filter(
                        (l) =>
                          l.classificacao === "fixo" &&
                          mesesPeriodo.some((mesIndex) => (l.valores[mesIndex] ?? 0) !== 0),
                      )
                      .sort(
                        (a, b) =>
                          somaValoresLinhaPeriodo(b.valores, mesesPeriodo) -
                          somaValoresLinhaPeriodo(a.valores, mesesPeriodo),
                      )
                      .map((l) => {
                        const v = somaValoresLinhaPeriodo(l.valores, mesesPeriodo);
                        return (
                          <tr key={l.nome} className="border-b">
                            <td className="px-5 py-2 font-medium">{l.nome}</td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {l.grupo === "custos"
                                ? "Custos Operacionais"
                                : "Despesas Operacionais"}
                            </td>
                            <td className="tabular px-3 py-2 text-right">{brl(v)}</td>
                            <td className="tabular px-5 py-2 text-right text-muted-foreground">
                              {pct(fixos ? (v / fixos) * 100 : 0)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </Bloco>
          </>
        )}
      </main>
    </>
  );
}

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className={cn("tabular font-medium", forte && "text-base text-info")}>{valor}</dd>
    </div>
  );
}

function somaValoresLinhaPeriodo(valores: number[], mesesPeriodo: number[]) {
  return mesesPeriodo.reduce((total, mesIndex) => total + Math.abs(valores[mesIndex] ?? 0), 0);
}
