import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TopBar } from "@/components/TopBar";
import { Bloco, Kpi, SemDados, SemEmpresa } from "@/components/ui-blocos";
import { useApp } from "@/lib/app-context";
import { useCategorias, useLancamentos } from "@/lib/data";
import {
  agregarPorCategoria,
  calcularDre,
  grupoDoLancamento,
  mediaFechados,
  nomeCategoria,
  type GrupoDre,
} from "@/lib/dre";
import { brl, dataBR, mesesCurtos, pct, variacao } from "@/lib/format";
import { cn } from "@/lib/utils";

export function GrupoDetalhe({
  grupo,
  titulo,
  descricao,
}: {
  grupo: GrupoDre;
  titulo: string;
  descricao: string;
}) {
  const { empresaId, ano, mes } = useApp();
  const { data: lancamentos = [], isLoading } = useLancamentos(empresaId, ano);
  const { data: categorias = [] } = useCategorias(empresaId);
  const [busca, setBusca] = useState("");
  const gruposDetalhe = useMemo<GrupoDre[]>(
    () => (grupo === "custos" ? ["deducoes", "custos"] : [grupo]),
    [grupo],
  );

  const resultados = useMemo(() => calcularDre(lancamentos, categorias), [lancamentos, categorias]);
  const linhas = useMemo(
    () =>
      agregarPorCategoria(lancamentos, categorias).filter((l) =>
        gruposDetalhe.includes(l.grupo),
      ),
    [lancamentos, categorias, gruposDetalhe],
  );

  const doGrupo = useMemo(
    () => lancamentos.filter((l) => gruposDetalhe.includes(grupoDoLancamento(l, categorias))),
    [lancamentos, categorias, gruposDetalhe],
  );

  const pick = (m: (typeof resultados)[number]) =>
    grupo === "receita_operacional"
      ? m.receitaBruta
      : grupo === "custos"
        ? m.deducoes + m.custos
        : grupo === "despesas"
          ? m.despesas
          : 0;

  const atual = resultados[mes]!;
  const anterior = mes > 0 ? resultados[mes - 1] : undefined;
  const totalMes = pick(atual);
  const totalAnterior = anterior ? pick(anterior) : 0;
  const media = mediaFechados(resultados, pick);
  const acumuladoAno = resultados.reduce((s, m) => s + pick(m), 0);
  const receitaMes = atual.receitaBruta;

  const serie = resultados
    .filter((m) => m.temMovimento)
    .map((m) => ({ mes: mesesCurtos[m.mes], valor: pick(m) }));

  const ranking = linhas
    .map((l) => ({
      nome: l.nome,
      classificacao: l.classificacao,
      valorMes: Math.abs(l.valores[mes] ?? 0),
      valorAnterior: mes > 0 ? Math.abs(l.valores[mes - 1] ?? 0) : 0,
      ano: l.valores.reduce((s, v) => s + Math.abs(v), 0),
    }))
    .filter((l) => l.valorMes > 0 || l.ano > 0)
    .sort((a, b) => b.valorMes - a.valorMes);

  const fixos = linhas.reduce(
    (s, l) => s + (l.classificacao === "fixo" ? Math.abs(l.valores[mes] ?? 0) : 0),
    0,
  );
  const variaveis = Math.max(totalMes - fixos, 0);

  const detalhes = doGrupo
    .filter((l) => Number(l.competencia.slice(5, 7)) - 1 === mes)
    .filter((l) => {
      if (!busca.trim()) return true;
      const t = busca.toLowerCase();
      return (
        l.descricao.toLowerCase().includes(t) ||
        (l.pessoa ?? "").toLowerCase().includes(t) ||
        nomeCategoria(l, categorias).toLowerCase().includes(t)
      );
    })
    .sort((a, b) => Number(b.valor) - Number(a.valor));

  return (
    <>
      <TopBar titulo={titulo} descricao={descricao} busca={busca} onBusca={setBusca} />
      <main className="space-y-5 p-6">
        {!empresaId ? (
          <SemEmpresa />
        ) : isLoading ? (
          <SemDados mensagem="Carregando dados..." />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi
                titulo={`${titulo} do mês`}
                valor={totalMes}
                variacaoPct={variacao(totalMes, totalAnterior)}
                anterior={totalAnterior}
                tom={grupo === "receita_operacional" ? "neutro" : "atencao"}
              />
              <Kpi titulo="Média mensal" valor={media} legenda="meses com movimento" />
              <Kpi titulo="Acumulado no ano" valor={acumuladoAno} legenda={`exercício ${ano}`} />
              <Kpi
                titulo={
                  grupo === "receita_operacional" ? "Ticket por categoria" : "% da Receita"
                }
                valor={
                  grupo === "receita_operacional"
                    ? totalMes / Math.max(ranking.length, 1)
                    : totalMes
                }
                legenda={
                  grupo === "receita_operacional"
                    ? `${ranking.length} categorias ativas`
                    : `representa ${
                        receitaMes ? pct((totalMes / receitaMes) * 100) : "—"
                      } da receita`
                }
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              <Bloco titulo="Evolução mensal" className="xl:col-span-2">
                {serie.length === 0 ? (
                  <SemDados mensagem="Sem movimento no exercício." />
                ) : (
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      {grupo === "receita_operacional" ? (
                        <LineChart data={serie}>
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
                          <Line
                            type="monotone"
                            dataKey="valor"
                            stroke="var(--positive)"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      ) : (
                        <BarChart data={serie}>
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
                          <Bar
                            dataKey="valor"
                            fill={grupo === "custos" ? "var(--warning)" : "var(--negative)"}
                            radius={[6, 6, 0, 0]}
                          />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                )}
              </Bloco>

              <Bloco titulo="Fixo x Variável no mês">
                <div className="space-y-4">
                  <Barra rotulo="Fixos" valor={fixos} total={totalMes} cor="bg-info" />
                  <Barra rotulo="Variáveis" valor={variaveis} total={totalMes} cor="bg-warning" />
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Estrutura fixa representa {totalMes ? pct((fixos / totalMes) * 100) : "—"} do
                  total do mês. Quanto maior, menor a flexibilidade da operação para reagir a queda
                  de receita.
                </p>
              </Bloco>
            </div>

            <Bloco titulo="Ranking por categoria">
              {ranking.length === 0 ? (
                <SemDados mensagem="Nenhuma categoria com movimento." />
              ) : (
                <div className="-mx-5 -mb-5 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-5 py-2 text-left font-medium">Categoria</th>
                        <th className="px-3 py-2 text-left font-medium">Tipo</th>
                        <th className="px-3 py-2 text-right font-medium">Mês</th>
                        <th className="px-3 py-2 text-right font-medium">Mês anterior</th>
                        <th className="px-3 py-2 text-right font-medium">Variação</th>
                        <th className="px-5 py-2 text-right font-medium">Acumulado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((r) => {
                        const v = variacao(r.valorMes, r.valorAnterior);
                        return (
                          <tr key={r.nome} className="border-b hover:bg-muted/30">
                            <td className="px-5 py-2 font-medium">{r.nome}</td>
                            <td className="px-3 py-2">
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-[10px] font-medium",
                                  r.classificacao === "fixo"
                                    ? "bg-info-soft text-info"
                                    : "bg-warning-soft text-warning",
                                )}
                              >
                                {r.classificacao === "fixo" ? "Fixo" : "Variável"}
                              </span>
                            </td>
                            <td className="tabular px-3 py-2 text-right">{brl(r.valorMes)}</td>
                            <td className="tabular px-3 py-2 text-right text-muted-foreground">
                              {brl(r.valorAnterior)}
                            </td>
                            <td
                              className={cn(
                                "tabular px-3 py-2 text-right",
                                v == null
                                  ? "text-muted-foreground"
                                  : (grupo === "receita_operacional" ? v > 0 : v < 0)
                                    ? "text-positive"
                                    : "text-negative",
                              )}
                            >
                              {v == null ? "—" : pct(v)}
                            </td>
                            <td className="tabular px-5 py-2 text-right">{brl(r.ano)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Bloco>

            <Bloco titulo={`Lançamentos do mês (${detalhes.length})`}>
              {detalhes.length === 0 ? (
                <SemDados mensagem="Nenhum lançamento para o filtro atual." />
              ) : (
                <div className="-mx-5 -mb-5 max-h-[520px] overflow-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                      <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-5 py-2 text-left font-medium">Data</th>
                        <th className="px-3 py-2 text-left font-medium">Descrição</th>
                        <th className="px-3 py-2 text-left font-medium">Cliente / Fornecedor</th>
                        <th className="px-3 py-2 text-left font-medium">Categoria</th>
                        <th className="px-5 py-2 text-right font-medium">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalhes.map((l) => (
                        <tr key={l.id} className="border-b hover:bg-muted/30">
                          <td className="px-5 py-2 text-muted-foreground">
                            {dataBR(l.data_efetiva)}
                          </td>
                          <td className="max-w-[280px] truncate px-3 py-2">{l.descricao || "—"}</td>
                          <td className="max-w-[200px] truncate px-3 py-2 text-muted-foreground">
                            {l.pessoa || "—"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {nomeCategoria(l, categorias)}
                          </td>
                          <td className="tabular px-5 py-2 text-right font-medium">
                            {brl(Math.abs(Number(l.valor)))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Bloco>
          </>
        )}
      </main>
    </>
  );
}

function Barra({
  rotulo,
  valor,
  total,
  cor,
}: {
  rotulo: string;
  valor: number;
  total: number;
  cor: string;
}) {
  const p = total ? (valor / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{rotulo}</span>
        <span className="tabular font-medium">
          {brl(valor)} · {pct(p)}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", cor)} style={{ width: `${Math.min(p, 100)}%` }} />
      </div>
    </div>
  );
}
