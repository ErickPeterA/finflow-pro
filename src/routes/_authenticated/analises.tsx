import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TopBar } from "@/components/TopBar";
import { Bloco, SemDados, SemEmpresa } from "@/components/ui-blocos";
import { useApp } from "@/lib/app-context";
import { useCategorias, useConfiguracao, useLancamentos } from "@/lib/data";
import { agregarPorCategoria, calcularDre, mediaFechados, serieMensal } from "@/lib/dre";
import { brl, mesesCurtos, pct, variacao } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/analises")({
  head: () => ({
    meta: [
      { title: "Análises | Ecossistema Financeiro BPO" },
      {
        name: "description",
        content:
          "Tendências, margens, recorrência e comparativos mês a mês para apoiar a consultoria financeira.",
      },
      { property: "og:title", content: "Análises | Ecossistema Financeiro BPO" },
      {
        property: "og:description",
        content: "Leitura analítica da evolução do resultado ao longo do exercício.",
      },
    ],
  }),
  component: AnalisesPage,
});

function AnalisesPage() {
  const { empresaId, ano, mes } = useApp();
  const { data: lancamentos = [], isLoading } = useLancamentos(empresaId, ano);
  const { data: categorias = [] } = useCategorias(empresaId);
  const { data: config } = useConfiguracao(empresaId);
  const margemDesejada = Number(config?.margem_desejada ?? 15);

  const resultados = useMemo(() => calcularDre(lancamentos, categorias), [lancamentos, categorias]);
  const serie = useMemo(() => serieMensal(resultados, 11), [resultados]);
  const linhas = useMemo(
    () => agregarPorCategoria(lancamentos, categorias),
    [lancamentos, categorias],
  );

  const comMovimento = resultados.filter((m) => m.temMovimento);
  const receitaMedia = mediaFechados(resultados, (m) => m.receitaLiquida);
  const resultadoMedio = mediaFechados(resultados, (m) => m.resultadoOperacional);
  const margemMedia = mediaFechados(resultados, (m) => m.margemOperacional);

  const recorrentes = linhas.filter((l) => l.recorrente);
  const naoRecorrentes = linhas.filter((l) => !l.recorrente);
  const totalRec = recorrentes.reduce((s, l) => s + Math.abs(l.valores[mes] ?? 0), 0);
  const totalNao = naoRecorrentes.reduce((s, l) => s + Math.abs(l.valores[mes] ?? 0), 0);

  const volatilidade = useMemo(() => {
    const vals = comMovimento.map((m) => m.resultadoOperacional);
    if (vals.length < 2) return 0;
    const media = vals.reduce((s, v) => s + v, 0) / vals.length;
    const desvio = Math.sqrt(
      vals.reduce((s, v) => s + (v - media) ** 2, 0) / vals.length,
    );
    return media !== 0 ? (desvio / Math.abs(media)) * 100 : 0;
  }, [comMovimento]);

  const comparativo = useMemo(
    () =>
      linhas
        .map((l) => {
          const atual = Math.abs(l.valores[mes] ?? 0);
          const media =
            l.valores.filter((v) => v !== 0).reduce((s, v) => s + Math.abs(v), 0) /
            Math.max(l.valores.filter((v) => v !== 0).length, 1);
          return { nome: l.nome, grupo: l.grupo, atual, media, desvio: variacao(atual, media) };
        })
        .filter((l) => l.atual > 0 && l.desvio != null && Math.abs(l.desvio) > 20)
        .sort((a, b) => Math.abs(b.desvio ?? 0) - Math.abs(a.desvio ?? 0))
        .slice(0, 12),
    [linhas, mes],
  );

  return (
    <>
      <TopBar titulo="Análises" descricao={`Tendências e comportamento do exercício ${ano}`} />
      <main className="space-y-5 p-6">
        {!empresaId ? (
          <SemEmpresa />
        ) : isLoading ? (
          <SemDados mensagem="Carregando análises..." />
        ) : comMovimento.length === 0 ? (
          <SemDados mensagem="Ainda não há lançamentos importados neste exercício." />
        ) : (
          <>
            <Bloco titulo="Evolução do resultado e da margem">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={serie}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis
                      yAxisId="esq"
                      tickFormatter={(v) => brl(Number(v), true)}
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      width={80}
                    />
                    <YAxis
                      yAxisId="dir"
                      orientation="right"
                      tickFormatter={(v) => `${v}%`}
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      width={50}
                    />
                    <Tooltip
                      formatter={(v, n) =>
                        String(n).includes("argem") ? `${Number(v).toFixed(1)}%` : brl(Number(v))
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      yAxisId="esq"
                      dataKey="receitaLiquida"
                      name="Receita Líquida"
                      fill="var(--info)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      yAxisId="esq"
                      dataKey="resultadoOperacional"
                      name="Resultado Operacional"
                      fill="var(--positive)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      yAxisId="dir"
                      type="monotone"
                      dataKey="margemOperacional"
                      name="Margem Operacional (%)"
                      stroke="var(--warning)"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Bloco>

            <div className="grid gap-5 xl:grid-cols-3">
              <Bloco titulo="Médias do exercício" className="xl:col-span-1">
                <dl className="space-y-3 text-sm">
                  <Item rotulo="Receita líquida média" valor={brl(receitaMedia)} />
                  <Item rotulo="Resultado operacional médio" valor={brl(resultadoMedio)} />
                  <Item rotulo="Margem operacional média" valor={pct(margemMedia)} />
                  <Item rotulo="Margem desejada" valor={pct(margemDesejada)} />
                  <Item
                    rotulo="Meses com movimento"
                    valor={`${comMovimento.length} de 12`}
                  />
                  <Item
                    rotulo="Volatilidade do resultado"
                    valor={pct(volatilidade)}
                    destaque={volatilidade > 50 ? "negativo" : "positivo"}
                  />
                </dl>
                <p className="mt-4 text-xs text-muted-foreground">
                  Volatilidade alta indica resultado dependente de eventos pontuais, não de um
                  padrão sustentável de operação.
                </p>
              </Bloco>

              <Bloco titulo="Acumulado do resultado" className="xl:col-span-2">
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={resultados
                        .filter((m) => m.temMovimento)
                        .map((m, i, arr) => ({
                          mes: mesesCurtos[m.mes],
                          acumulado: arr
                            .slice(0, i + 1)
                            .reduce((s, x) => s + x.resultadoOperacional, 0),
                        }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis
                        tickFormatter={(v) => brl(Number(v), true)}
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        width={80}
                      />
                      <Tooltip formatter={(v) => brl(Number(v))} />
                      <Area
                        type="monotone"
                        dataKey="acumulado"
                        stroke="var(--info)"
                        fill="var(--info-soft)"
                        strokeWidth={2.5}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Bloco>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Bloco titulo="Recorrência do mês">
                <dl className="space-y-3 text-sm">
                  <Item rotulo="Movimentos recorrentes" valor={brl(totalRec)} />
                  <Item rotulo="Movimentos não recorrentes" valor={brl(totalNao)} />
                  <Item
                    rotulo="Participação recorrente"
                    valor={pct(totalRec + totalNao ? (totalRec / (totalRec + totalNao)) * 100 : 0)}
                  />
                </dl>
                <p className="mt-4 text-xs text-muted-foreground">
                  Quanto maior a participação recorrente, mais previsível é o resultado do próximo
                  mês.
                </p>
              </Bloco>

              <Bloco titulo="Desvios relevantes frente à média">
                {comparativo.length === 0 ? (
                  <SemDados mensagem="Nenhuma categoria fora do padrão neste mês." />
                ) : (
                  <ul className="space-y-2">
                    {comparativo.map((c) => (
                      <li
                        key={c.nome}
                        className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{c.nome}</span>
                          <span className="block text-xs text-muted-foreground">
                            média {brl(c.media, true)} · mês {brl(c.atual, true)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "tabular shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                            (c.desvio ?? 0) > 0
                              ? "bg-negative-soft text-negative"
                              : "bg-positive-soft text-positive",
                          )}
                        >
                          {(c.desvio ?? 0) > 0 ? "+" : ""}
                          {pct(c.desvio ?? 0)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Bloco>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function Item({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  destaque?: "positivo" | "negativo";
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd
        className={cn(
          "tabular font-medium",
          destaque === "positivo" && "text-positive",
          destaque === "negativo" && "text-negative",
        )}
      >
        {valor}
      </dd>
    </div>
  );
}
