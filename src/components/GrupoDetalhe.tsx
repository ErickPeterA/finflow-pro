import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TopBar } from "@/components/TopBar";
import { Bloco, Kpi, SemDados, SemEmpresa } from "@/components/ui-blocos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/lib/app-context";
import { filtrarLancamentosPorCentroCusto } from "@/lib/centro-custo";
import { useCategorias, useLancamentos } from "@/lib/data";
import {
  agregarPorCategoria,
  calcularDre,
  grupoDoLancamento,
  mediaFechados,
  mesDaCompetencia,
  nomeCategoria,
  type Categoria,
  type GrupoDre,
  type Lancamento,
  type ResultadoMes,
} from "@/lib/dre";
import { brl, dataBR, mesesCurtos, pct, variacao } from "@/lib/format";
import { cn } from "@/lib/utils";

const coresPizza = [
  "var(--positive)",
  "var(--info)",
  "var(--warning)",
  "var(--negative)",
  "var(--primary)",
  "var(--muted-foreground)",
  "var(--border)",
];

type DirecaoOrdenacao = "asc" | "desc";
type OrdenacaoRanking = {
  campo: "valorMes" | "nome" | "ano";
  direcao: DirecaoOrdenacao;
};
type OrdenacaoDetalhes = {
  campo: "data" | "valor";
  direcao: DirecaoOrdenacao;
};
type RotuloVariacaoProps = {
  x?: number | string | undefined;
  y?: number | string | undefined;
  width?: number | string | undefined;
  value?: number | string | undefined;
  payload?:
    | {
        valor?: number;
        variacaoPct?: number | null;
      }
    | undefined;
};
type TooltipMensalProps = {
  active?: boolean | undefined;
  label?: unknown;
  payload?:
    | Array<{
        value?: unknown;
        payload?: unknown;
      }>
    | undefined;
};
type FiltroCusto =
  | "custos_operacionais"
  | "deducao_receita"
  | "custos_diretos"
  | "custos_indiretos"
  | "comissionamento"
  | "custos_pessoais"
  | "custos_marketing"
  | "despesas_operacionais";

const filtrosCusto: Array<{
  id: FiltroCusto;
  rotulo: string;
  descricao: string;
}> = [
  {
    id: "custos_operacionais",
    rotulo: "Custos Operacionais",
    descricao: "Dedução de receita + custos operacionais do DRE",
  },
  {
    id: "deducao_receita",
    rotulo: "Dedução de receita",
    descricao: "Linha de dedução da receita",
  },
  {
    id: "custos_diretos",
    rotulo: "Custos diretos",
    descricao: "Categorias com prefixo 2.2",
  },
  {
    id: "custos_indiretos",
    rotulo: "Custos indiretos",
    descricao: "Categorias com prefixo 2.3",
  },
  {
    id: "comissionamento",
    rotulo: "Comissionamento",
    descricao: "Categorias com prefixo 2.4 ou nome com comissionamento",
  },
  {
    id: "custos_pessoais",
    rotulo: "Custos pessoais",
    descricao: "Categorias com prefixo 2.5 ou nome com pessoais",
  },
  {
    id: "custos_marketing",
    rotulo: "Custos de marketing",
    descricao: "Categorias com prefixo 2.6 ou nome com marketing",
  },
  {
    id: "despesas_operacionais",
    rotulo: "Despesas operacionais",
    descricao: "Linha de despesas operacionais do DRE",
  },
];

export function GrupoDetalhe({
  grupo,
  titulo,
  descricao,
}: {
  grupo: GrupoDre;
  titulo: string;
  descricao: string;
}) {
  const { empresaId, ano, mes, centroCusto } = useApp();
  const { data: lancamentos = [], isLoading } = useLancamentos(empresaId, ano);
  const { data: categorias = [] } = useCategorias(empresaId);
  const [busca, setBusca] = useState("");
  const [ordenacaoRanking, setOrdenacaoRanking] = useState<OrdenacaoRanking>({
    campo: "valorMes",
    direcao: "desc",
  });
  const [ordenacaoDetalhes, setOrdenacaoDetalhes] = useState<OrdenacaoDetalhes>({
    campo: "valor",
    direcao: "desc",
  });
  const [filtroCusto, setFiltroCusto] = useState<FiltroCusto>("custos_operacionais");
  const [buscaPessoaAberta, setBuscaPessoaAberta] = useState(false);
  const [buscaPessoa, setBuscaPessoa] = useState("");
  const [buscaCategoriaAberta, setBuscaCategoriaAberta] = useState(false);
  const [buscaCategoria, setBuscaCategoria] = useState("");
  const gruposDetalhe = useMemo<GrupoDre[]>(
    () => (grupo === "custos" ? ["deducoes", "custos"] : [grupo]),
    [grupo],
  );
  const lancamentosFiltrados = useMemo(
    () => filtrarLancamentosPorCentroCusto(lancamentos, centroCusto),
    [lancamentos, centroCusto],
  );

  const resultados = useMemo(
    () => calcularDre(lancamentosFiltrados, categorias),
    [lancamentosFiltrados, categorias],
  );
  const linhas = useMemo(
    () =>
      agregarPorCategoria(lancamentosFiltrados, categorias).filter((l) =>
        gruposDetalhe.includes(l.grupo),
      ),
    [lancamentosFiltrados, categorias, gruposDetalhe],
  );

  const doGrupo = useMemo(
    () =>
      lancamentosFiltrados.filter((l) => gruposDetalhe.includes(grupoDoLancamento(l, categorias))),
    [lancamentosFiltrados, categorias, gruposDetalhe],
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
    .map((m) => {
      const valor = pick(m);
      const mesAnterior = m.mes > 0 ? resultados[m.mes - 1] : undefined;
      const valorAnterior = mesAnterior ? pick(mesAnterior) : 0;
      return {
        mes: mesesCurtos[m.mes],
        valor,
        variacaoPct: variacao(valor, valorAnterior),
      };
    });

  const rankingBase = linhas
    .map((l) => ({
      nome: l.nome,
      classificacao: l.classificacao,
      valorMes: Math.abs(l.valores[mes] ?? 0),
      valorAnterior: mes > 0 ? Math.abs(l.valores[mes - 1] ?? 0) : 0,
      ano: l.valores.reduce((s, v) => s + Math.abs(v), 0),
    }))
    .filter((l) => l.valorMes > 0 || l.ano > 0)
    .sort((a, b) => b.valorMes - a.valorMes);
  const ranking = useMemo(() => {
    const direcao = ordenacaoRanking.direcao === "asc" ? 1 : -1;
    return [...rankingBase].sort((a, b) => {
      if (ordenacaoRanking.campo === "nome") {
        return a.nome.localeCompare(b.nome, "pt-BR") * direcao;
      }
      return (a[ordenacaoRanking.campo] - b[ordenacaoRanking.campo]) * direcao;
    });
  }, [rankingBase, ordenacaoRanking]);

  const pizzaCategorias = useMemo(() => {
    const usaMesAtual = rankingBase.some((r) => r.valorMes > 0);
    const principais = rankingBase.slice(0, 6).map((r) => ({
      nome: r.nome,
      valor: usaMesAtual ? r.valorMes : r.ano,
    }));
    const outras = rankingBase.slice(6).reduce((s, r) => s + (usaMesAtual ? r.valorMes : r.ano), 0);
    if (outras > 0) principais.push({ nome: "Outras", valor: outras });
    return principais.filter((item) => item.valor > 0);
  }, [rankingBase]);
  const totalPizzaCategorias = pizzaCategorias.reduce((s, item) => s + item.valor, 0);
  const serieCustoSelecionado = useMemo(
    () => serieFiltroCusto(filtroCusto, resultados, lancamentosFiltrados, categorias),
    [filtroCusto, resultados, lancamentosFiltrados, categorias],
  );
  const filtroCustoSelecionado = filtrosCusto.find((opcao) => opcao.id === filtroCusto)!;
  const totalCustoSelecionado = serieCustoSelecionado.reduce((s, item) => s + item.valor, 0);
  const mesCustoSelecionado =
    serieCustoSelecionado.find((item) => item.mesIndex === mes)?.valor ?? 0;

  const detalhesBase = useMemo(
    () =>
      grupo === "custos"
        ? lancamentosFiltrados.filter((l) =>
            lancamentoPertenceAoFiltroCusto(filtroCusto, l, categorias),
          )
        : doGrupo,
    [grupo, filtroCusto, lancamentosFiltrados, categorias, doGrupo],
  );

  const detalhes = detalhesBase
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
    .filter((l) => {
      if (!buscaPessoa.trim()) return true;
      return (l.pessoa ?? "").toLowerCase().includes(buscaPessoa.toLowerCase());
    })
    .filter((l) => {
      if (!buscaCategoria.trim()) return true;
      return nomeCategoria(l, categorias).toLowerCase().includes(buscaCategoria.toLowerCase());
    })
    .sort((a, b) => {
      const direcao = ordenacaoDetalhes.direcao === "asc" ? 1 : -1;
      if (ordenacaoDetalhes.campo === "data") {
        return a.data_efetiva.localeCompare(b.data_efetiva) * direcao;
      }
      return (Number(a.valor) - Number(b.valor)) * direcao;
    });
  const permiteFiltrosTabela =
    grupo === "receita_operacional" || grupo === "custos" || grupo === "despesas";
  const tituloLancamentos =
    grupo === "custos"
      ? `Lançamentos do mês - ${filtroCustoSelecionado.rotulo} (${detalhes.length})`
      : `Lançamentos do mês (${detalhes.length})`;

  function alternarOrdenacaoRanking(campo: OrdenacaoRanking["campo"]) {
    setOrdenacaoRanking((atual) => ({
      campo,
      direcao: atual.campo === campo && atual.direcao === "desc" ? "asc" : "desc",
    }));
  }

  function alternarOrdenacaoDetalhes(campo: OrdenacaoDetalhes["campo"]) {
    setOrdenacaoDetalhes((atual) => ({
      campo,
      direcao: atual.campo === campo && atual.direcao === "desc" ? "asc" : "desc",
    }));
  }

  function renderRotuloMensal({ x = 0, y = 0, width = 0, value, payload }: RotuloVariacaoProps) {
    const valor = Number(payload?.valor ?? value);
    const variacaoPct = payload?.variacaoPct;

    const centroX = Number(x) + Number(width) / 2;
    const posicaoY = Number(y) - (variacaoPct == null ? 10 : 22);
    const favoravel =
      variacaoPct == null
        ? false
        : grupo === "receita_operacional"
          ? variacaoPct > 0
          : variacaoPct < 0;
    const cor =
      variacaoPct == null || variacaoPct === 0
        ? "var(--muted-foreground)"
        : favoravel
          ? "var(--positive)"
          : "var(--negative)";
    const sinal = variacaoPct != null && variacaoPct > 0 ? "+" : "";

    return (
      <text
        x={centroX}
        y={posicaoY}
        textAnchor="middle"
        fill="var(--foreground)"
        fontSize={11}
        fontWeight={700}
        className="tabular"
        stroke="var(--card)"
        strokeWidth={4}
        paintOrder="stroke"
      >
        <tspan x={centroX}>{brl(valor, true)}</tspan>
        {variacaoPct != null && (
          <tspan x={centroX} dy={14} fill={cor}>
            {sinal}
            {pct(variacaoPct)}
          </tspan>
        )}
      </text>
    );
  }

  function renderTooltipMensal({ active, label, payload }: TooltipMensalProps) {
    const item = payload?.[0];
    if (!active || !item) return null;

    const dados = item.payload as { valor?: number; variacaoPct?: number | null } | undefined;
    const valor = Number(dados?.valor ?? item.value);
    const variacaoPct = dados?.variacaoPct;
    const sinal = variacaoPct != null && variacaoPct > 0 ? "+" : "";

    return (
      <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-card">
        <p className="font-medium">{String(label ?? "")}</p>
        <p className="tabular text-foreground">{brl(valor)}</p>
        <p className="tabular text-muted-foreground">
          {variacaoPct == null
            ? "Sem base anterior"
            : `${sinal}${pct(variacaoPct)} vs mês anterior`}
        </p>
      </div>
    );
  }

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
                titulo={grupo === "receita_operacional" ? "Ticket por categoria" : "% da Receita"}
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
              <Bloco
                titulo="Evolução mensal"
                className={cn(grupo === "custos" ? "xl:col-span-3" : "xl:col-span-2")}
              >
                {serie.length === 0 ? (
                  <SemDados mensagem="Sem movimento no exercício." />
                ) : (
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      {grupo === "receita_operacional" ? (
                        <LineChart data={serie} margin={{ top: 54, right: 12, left: 0, bottom: 0 }}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="var(--border)"
                          />
                          <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
                          <YAxis
                            tickFormatter={(v) => brl(Number(v), true)}
                            tickLine={false}
                            axisLine={false}
                            fontSize={12}
                            width={80}
                          />
                          <Tooltip content={renderTooltipMensal} />
                          <Line
                            type="monotone"
                            dataKey="valor"
                            stroke="var(--positive)"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                          >
                            <LabelList dataKey="valor" content={renderRotuloMensal} />
                          </Line>
                        </LineChart>
                      ) : (
                        <BarChart data={serie} margin={{ top: 54, right: 12, left: 0, bottom: 0 }}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="var(--border)"
                          />
                          <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
                          <YAxis
                            tickFormatter={(v) => brl(Number(v), true)}
                            tickLine={false}
                            axisLine={false}
                            fontSize={12}
                            width={80}
                          />
                          <Tooltip content={renderTooltipMensal} />
                          <Bar
                            dataKey="valor"
                            fill={grupo === "custos" ? "var(--warning)" : "var(--negative)"}
                            radius={[6, 6, 0, 0]}
                          >
                            <LabelList dataKey="valor" content={renderRotuloMensal} />
                          </Bar>
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                )}
              </Bloco>

              {(grupo === "receita_operacional" || grupo === "despesas") && (
                <Bloco
                  titulo={
                    grupo === "receita_operacional"
                      ? "Receita por categoria"
                      : "Despesas por categoria"
                  }
                >
                  {pizzaCategorias.length === 0 ? (
                    <SemDados mensagem="Nenhuma categoria com movimento." />
                  ) : (
                    <div className="space-y-3">
                      <div className="h-52">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pizzaCategorias}
                              dataKey="valor"
                              nameKey="nome"
                              innerRadius={48}
                              outerRadius={78}
                              paddingAngle={2}
                            >
                              {pizzaCategorias.map((item, index) => (
                                <Cell
                                  key={item.nome}
                                  fill={coresPizza[index % coresPizza.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v) => brl(Number(v))} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <ul className="space-y-1.5 text-xs">
                        {pizzaCategorias.map((item, index) => (
                          <li key={item.nome} className="flex items-center justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: coresPizza[index % coresPizza.length] }}
                              />
                              <span className="truncate">{item.nome}</span>
                            </span>
                            <span className="shrink-0 tabular font-medium">
                              {totalPizzaCategorias
                                ? pct((item.valor / totalPizzaCategorias) * 100)
                                : "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Bloco>
              )}
            </div>

            {grupo === "custos" ? (
              <Bloco
                titulo="Gráfico individual de custos"
                acoes={
                  <Select
                    value={filtroCusto}
                    onValueChange={(valor) => setFiltroCusto(valor as FiltroCusto)}
                  >
                    <SelectTrigger className="h-9 w-[260px] max-w-[52vw]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {filtrosCusto.map((opcao) => (
                        <SelectItem key={opcao.id} value={opcao.id}>
                          {opcao.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              >
                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                  <ResumoCusto rotulo="Selecionado" valor={mesCustoSelecionado} />
                  <ResumoCusto rotulo="Acumulado no ano" valor={totalCustoSelecionado} />
                </div>

                {totalCustoSelecionado <= 0 ? (
                  <SemDados mensagem="Sem dados para este filtro no exercício." />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={serieCustoSelecionado}
                        margin={{ top: 54, right: 12, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="var(--border)"
                        />
                        <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
                        <YAxis
                          tickFormatter={(v) => brl(Number(v), true)}
                          tickLine={false}
                          axisLine={false}
                          fontSize={12}
                          width={80}
                        />
                        <Tooltip content={renderTooltipMensal} />
                        <Bar dataKey="valor" fill="var(--warning)" radius={[6, 6, 0, 0]}>
                          <LabelList dataKey="valor" content={renderRotuloMensal} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Bloco>
            ) : (
              <Bloco titulo="Ranking por categoria">
                {ranking.length === 0 ? (
                  <SemDados mensagem="Nenhuma categoria com movimento." />
                ) : (
                  <div className="-mx-5 -mb-5 overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-5 py-2 text-left font-medium">
                            {permiteFiltrosTabela ? (
                              <OrdenacaoBotao
                                rotulo="Categoria"
                                ativo={ordenacaoRanking.campo === "nome"}
                                direcao={ordenacaoRanking.direcao}
                                onClick={() => alternarOrdenacaoRanking("nome")}
                              />
                            ) : (
                              "Categoria"
                            )}
                          </th>
                          <th className="px-3 py-2 text-left font-medium">Tipo</th>
                          <th className="px-3 py-2 text-right font-medium">Mês</th>
                          <th className="px-3 py-2 text-right font-medium">Mês anterior</th>
                          <th className="px-3 py-2 text-right font-medium">Variação</th>
                          <th className="px-5 py-2 text-right font-medium">
                            {permiteFiltrosTabela ? (
                              <OrdenacaoBotao
                                rotulo="Acumulado"
                                ativo={ordenacaoRanking.campo === "ano"}
                                direcao={ordenacaoRanking.direcao}
                                alinhamento="right"
                                onClick={() => alternarOrdenacaoRanking("ano")}
                              />
                            ) : (
                              "Acumulado"
                            )}
                          </th>
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
            )}

            <Bloco titulo={tituloLancamentos}>
              {detalhes.length === 0 && !permiteFiltrosTabela ? (
                <SemDados mensagem="Nenhum lançamento para o filtro atual." />
              ) : (
                <div className="-mx-5 -mb-5 max-h-[520px] overflow-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                      <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-5 py-2 text-left font-medium">
                          {permiteFiltrosTabela ? (
                            <OrdenacaoBotao
                              rotulo="Data"
                              ativo={ordenacaoDetalhes.campo === "data"}
                              direcao={ordenacaoDetalhes.direcao}
                              onClick={() => alternarOrdenacaoDetalhes("data")}
                            />
                          ) : (
                            "Data"
                          )}
                        </th>
                        <th className="px-3 py-2 text-left font-medium">Descrição</th>
                        <th className="px-3 py-2 text-left font-medium">
                          <span className="flex items-center gap-1.5">
                            <span>Cliente / Fornecedor</span>
                            {permiteFiltrosTabela && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-6 w-6 text-muted-foreground hover:text-foreground",
                                  buscaPessoaAberta && "bg-secondary text-foreground",
                                )}
                                title="Buscar cliente ou fornecedor"
                                onClick={() => {
                                  setBuscaPessoaAberta((aberto) => !aberto);
                                  if (buscaPessoaAberta) setBuscaPessoa("");
                                }}
                              >
                                <Search className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </span>
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          <span className="flex items-center gap-1.5">
                            <span>Categoria</span>
                            {permiteFiltrosTabela && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-6 w-6 text-muted-foreground hover:text-foreground",
                                  buscaCategoriaAberta && "bg-secondary text-foreground",
                                )}
                                title="Buscar categoria"
                                onClick={() => {
                                  setBuscaCategoriaAberta((aberto) => !aberto);
                                  if (buscaCategoriaAberta) setBuscaCategoria("");
                                }}
                              >
                                <Search className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </span>
                        </th>
                        <th className="px-5 py-2 text-right font-medium">
                          {permiteFiltrosTabela ? (
                            <OrdenacaoBotao
                              rotulo="Valor"
                              ativo={ordenacaoDetalhes.campo === "valor"}
                              direcao={ordenacaoDetalhes.direcao}
                              alinhamento="right"
                              onClick={() => alternarOrdenacaoDetalhes("valor")}
                            />
                          ) : (
                            "Valor"
                          )}
                        </th>
                      </tr>
                      {permiteFiltrosTabela && (buscaPessoaAberta || buscaCategoriaAberta) && (
                        <tr className="border-b bg-muted/60">
                          <th colSpan={5} className="px-5 py-2">
                            <div className="flex flex-wrap justify-end gap-2">
                              {buscaPessoaAberta && (
                                <Input
                                  autoFocus
                                  value={buscaPessoa}
                                  onChange={(e) => setBuscaPessoa(e.target.value)}
                                  placeholder="Buscar por cliente ou fornecedor"
                                  className="h-8 max-w-sm bg-background text-xs normal-case"
                                />
                              )}
                              {buscaCategoriaAberta && (
                                <Input
                                  autoFocus={!buscaPessoaAberta}
                                  value={buscaCategoria}
                                  onChange={(e) => setBuscaCategoria(e.target.value)}
                                  placeholder="Buscar por categoria"
                                  className="h-8 max-w-sm bg-background text-xs normal-case"
                                />
                              )}
                            </div>
                          </th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {detalhes.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                            Nenhum lançamento para o filtro atual.
                          </td>
                        </tr>
                      ) : (
                        detalhes.map((l) => (
                          <tr key={l.id} className="border-b hover:bg-muted/30">
                            <td className="px-5 py-2 text-muted-foreground">
                              {dataBR(l.data_efetiva)}
                            </td>
                            <td className="max-w-[280px] truncate px-3 py-2">
                              {l.descricao || "—"}
                            </td>
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
                        ))
                      )}
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

function ResumoCusto({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="tabular mt-1 text-lg font-semibold text-warning">{brl(valor)}</p>
    </div>
  );
}

function serieFiltroCusto(
  filtro: FiltroCusto,
  resultados: ResultadoMes[],
  lancamentos: Lancamento[],
  categorias: Categoria[],
) {
  return resultados
    .filter((m) => m.temMovimento)
    .map((m) => {
      const valor = valorFiltroCusto(filtro, m, lancamentos, categorias);
      const anterior = m.mes > 0 ? resultados[m.mes - 1] : undefined;
      const valorAnterior = anterior
        ? valorFiltroCusto(filtro, anterior, lancamentos, categorias)
        : 0;

      return {
        mes: mesesCurtos[m.mes],
        mesIndex: m.mes,
        valor,
        variacaoPct: variacao(valor, valorAnterior),
      };
    });
}

function valorFiltroCusto(
  filtro: FiltroCusto,
  resultado: ResultadoMes,
  lancamentos: Lancamento[],
  categorias: Categoria[],
) {
  switch (filtro) {
    case "custos_operacionais":
      return resultado.deducoes + resultado.custos;
    case "deducao_receita":
      return (
        resultado.deducoes +
        valorPorPrefixoCusto(lancamentos, categorias, resultado.mes, "2.1", undefined, ["deducoes"])
      );
    case "custos_diretos":
      return valorPorPrefixoCusto(lancamentos, categorias, resultado.mes, "2.2");
    case "custos_indiretos":
      return valorPorPrefixoCusto(lancamentos, categorias, resultado.mes, "2.3");
    case "comissionamento":
      return valorPorPrefixoCusto(lancamentos, categorias, resultado.mes, "2.4", "comissionamento");
    case "custos_pessoais":
      return valorPorPrefixoCusto(lancamentos, categorias, resultado.mes, "2.5", "pessoais");
    case "custos_marketing":
      return valorPorPrefixoCusto(lancamentos, categorias, resultado.mes, "2.6", "marketing");
    case "despesas_operacionais":
      return resultado.despesas;
  }
}

function lancamentoPertenceAoFiltroCusto(
  filtro: FiltroCusto,
  lancamento: Lancamento,
  categorias: Categoria[],
) {
  const grupoLancamento = grupoDoLancamento(lancamento, categorias);

  switch (filtro) {
    case "custos_operacionais":
      return grupoLancamento === "deducoes" || grupoLancamento === "custos";
    case "deducao_receita":
      return (
        grupoLancamento === "deducoes" ||
        lancamentoCombinaFiltroCusto(lancamento, categorias, "2.1", undefined, ["deducoes"])
      );
    case "custos_diretos":
      return lancamentoCombinaFiltroCusto(lancamento, categorias, "2.2");
    case "custos_indiretos":
      return lancamentoCombinaFiltroCusto(lancamento, categorias, "2.3");
    case "comissionamento":
      return lancamentoCombinaFiltroCusto(lancamento, categorias, "2.4", "comissionamento");
    case "custos_pessoais":
      return lancamentoCombinaFiltroCusto(lancamento, categorias, "2.5", "pessoais");
    case "custos_marketing":
      return lancamentoCombinaFiltroCusto(lancamento, categorias, "2.6", "marketing");
    case "despesas_operacionais":
      return grupoLancamento === "despesas";
  }
}

function valorPorPrefixoCusto(
  lancamentos: Lancamento[],
  categorias: Categoria[],
  mes: number,
  prefixo: string,
  nomeContem?: string,
  gruposIgnorados: GrupoDre[] = [],
) {
  return lancamentos.reduce((total, lancamento) => {
    if (mesDaCompetencia(lancamento.competencia) !== mes) return total;
    if (
      !lancamentoCombinaFiltroCusto(lancamento, categorias, prefixo, nomeContem, gruposIgnorados)
    ) {
      return total;
    }
    return total + Math.abs(Number(lancamento.valor) || 0);
  }, 0);
}

function lancamentoCombinaFiltroCusto(
  lancamento: Lancamento,
  categorias: Categoria[],
  prefixo: string,
  nomeContem?: string,
  gruposIgnorados: GrupoDre[] = [],
) {
  if (gruposIgnorados.includes(grupoDoLancamento(lancamento, categorias))) return false;

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

  return temPrefixo || (temNome && pareceCustoOperacional);
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

function OrdenacaoBotao({
  rotulo,
  ativo,
  direcao,
  alinhamento = "left",
  onClick,
}: {
  rotulo: string;
  ativo: boolean;
  direcao: DirecaoOrdenacao;
  alinhamento?: "left" | "right";
  onClick: () => void;
}) {
  const Icone = direcao === "asc" ? ArrowUp : ArrowDown;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "h-6 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground",
        alinhamento === "right" && "ml-auto",
        ativo && "text-foreground",
      )}
      onClick={onClick}
    >
      <span>{rotulo}</span>
      <Icone className={cn("h-3.5 w-3.5", !ativo && "opacity-35")} />
    </Button>
  );
}
