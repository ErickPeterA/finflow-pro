import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TopBar } from "@/components/TopBar";
import { Bloco, SemDados, SemEmpresa } from "@/components/ui-blocos";
import { useApp } from "@/lib/app-context";
import { useCategorias, useConfiguracao, useLancamentos } from "@/lib/data";
import {
  agregarPorCategoria,
  calcularDre,
  grupoDoLancamento,
  type GrupoDre,
  type LinhaCategoria,
  mediaFechados,
  mesDaCompetencia,
  valorAssinado,
} from "@/lib/dre";
import { brl, meses, mesesCurtos, pct, variacao } from "@/lib/format";
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
  const [resultadosVisiveis, setResultadosVisiveis] = useState<ResultadoGrafico[]>([
    "resultadoBruto",
    "resultadoOperacional",
    "resultadoLiquido",
  ]);
  const [mesesVisiveis, setMesesVisiveis] = useState<number[]>([mes]);

  const resultados = useMemo(() => calcularDre(lancamentos, categorias), [lancamentos, categorias]);
  const linhas = useMemo(
    () => agregarPorCategoria(lancamentos, categorias),
    [lancamentos, categorias],
  );

  const comMovimento = resultados.filter((m) => m.temMovimento);
  const receitaMedia = mediaFechados(resultados, (m) => m.receitaBruta);
  const resultadoMedio = mediaFechados(resultados, (m) => m.resultadoOperacional);
  const margemMedia = mediaFechados(resultados, (m) => m.margemOperacional);

  const dadosContasResultado = useMemo(
    () =>
      resultados
        .filter((m) => mesesVisiveis.includes(m.mes))
        .map((m) => ({
          mes: nomeMesCurto(m.mes),
          resultadoBruto: m.resultadoBruto,
          resultadoOperacional: m.resultadoOperacional,
          resultadoLiquido: m.resultadoLiquido,
        })),
    [resultados, mesesVisiveis],
  );
  const dadosInvestimentos = useMemo(() => {
    const mapa = new Map(
      mesesVisiveis.map((mesIndex) => [
        mesIndex,
        {
          mes: nomeMesCurto(mesIndex),
          grupo4: 0,
          grupo5: 0,
          saldo: 0,
        },
      ]),
    );

    for (const lancamento of lancamentos) {
      const mesIndex = mesDaCompetencia(lancamento.competencia);
      const item = mapa.get(mesIndex);
      if (!item) continue;

      const grupo = grupoDoLancamento(lancamento, categorias);
      const valor = valorAssinado(grupo, lancamento);

      if (grupo === "financeiro") item.grupo4 += valor;
      if (grupo === "nao_operacional") item.grupo5 += valor;
      item.saldo = item.grupo4 + item.grupo5;
    }

    return mesesVisiveis.map((mesIndex) => mapa.get(mesIndex)!);
  }, [lancamentos, categorias, mesesVisiveis]);
  const categoriasInvestimento = useMemo(
    () => categoriasPorGrupo(linhas, "financeiro", mesesVisiveis),
    [linhas, mesesVisiveis],
  );
  const categoriasFinanciamento = useMemo(
    () => categoriasPorGrupo(linhas, "nao_operacional", mesesVisiveis),
    [linhas, mesesVisiveis],
  );

  const volatilidade = useMemo(() => {
    const vals = comMovimento.map((m) => m.resultadoOperacional);
    if (vals.length < 2) return 0;
    const media = vals.reduce((s, v) => s + v, 0) / vals.length;
    const desvio = Math.sqrt(vals.reduce((s, v) => s + (v - media) ** 2, 0) / vals.length);
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
            <GraficoContasResultado
              dados={dadosContasResultado}
              mesesVisiveis={mesesVisiveis}
              resultadosVisiveis={resultadosVisiveis}
              onToggleResultado={(key) =>
                setResultadosVisiveis((atuais) =>
                  atuais.includes(key)
                    ? atuais.length === 1
                      ? atuais
                      : atuais.filter((item) => item !== key)
                    : [...atuais, key],
                )
              }
              onToggleMes={(index) =>
                setMesesVisiveis((atuais) =>
                  atuais.includes(index)
                    ? atuais.length === 1
                      ? atuais
                      : atuais.filter((item) => item !== index)
                    : [...atuais, index].sort((a, b) => a - b),
                )
              }
              onTodosResultados={() =>
                setResultadosVisiveis([
                  "resultadoBruto",
                  "resultadoOperacional",
                  "resultadoLiquido",
                ])
              }
              onTodosMeses={() => setMesesVisiveis(Array.from({ length: 12 }, (_, i) => i))}
              onMesAtual={() => setMesesVisiveis([mes])}
            />

            <GraficoInvestimentos dados={dadosInvestimentos} mesesVisiveis={mesesVisiveis} />

            <div className="grid gap-5 lg:grid-cols-2">
              <BlocoCategoriasFinanceiras
                titulo="Categorias de investimento"
                categorias={categoriasInvestimento}
              />
              <BlocoCategoriasFinanceiras
                titulo="Categorias de financiamento"
                categorias={categoriasFinanciamento}
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Bloco titulo="Médias do exercício">
                <dl className="space-y-3 text-sm">
                  <Item rotulo="Receita média" valor={brl(receitaMedia)} />
                  <Item rotulo="Resultado operacional médio" valor={brl(resultadoMedio)} />
                  <Item rotulo="Margem operacional média" valor={pct(margemMedia)} />
                  <Item rotulo="Margem desejada" valor={pct(margemDesejada)} />
                  <Item rotulo="Meses com movimento" valor={`${comMovimento.length} de 12`} />
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

type ResultadoGrafico = "resultadoBruto" | "resultadoOperacional" | "resultadoLiquido";

const resultadoOpcoes: Array<{
  key: ResultadoGrafico;
  label: string;
  fill: string;
  softClass: string;
  activeClass: string;
}> = [
  {
    key: "resultadoBruto",
    label: "Resultado bruto",
    fill: "var(--positive)",
    softClass: "bg-positive-soft text-positive",
    activeClass: "border-positive bg-positive text-white shadow-sm",
  },
  {
    key: "resultadoOperacional",
    label: "Resultado operacional",
    fill: "var(--info)",
    softClass: "bg-info-soft text-info",
    activeClass: "border-info bg-info text-white shadow-sm",
  },
  {
    key: "resultadoLiquido",
    label: "Resultado líquido",
    fill: "var(--warning)",
    softClass: "bg-warning-soft text-warning",
    activeClass: "border-warning bg-warning text-white shadow-sm",
  },
];

function GraficoContasResultado({
  dados,
  mesesVisiveis,
  resultadosVisiveis,
  onToggleResultado,
  onToggleMes,
  onTodosResultados,
  onTodosMeses,
  onMesAtual,
}: {
  dados: Array<Record<ResultadoGrafico, number> & { mes: string }>;
  mesesVisiveis: number[];
  resultadosVisiveis: ResultadoGrafico[];
  onToggleResultado: (key: ResultadoGrafico) => void;
  onToggleMes: (index: number) => void;
  onTodosResultados: () => void;
  onTodosMeses: () => void;
  onMesAtual: () => void;
}) {
  const totais = resultadoOpcoes.map((opcao) => ({
    ...opcao,
    total: dados.reduce((s, item) => s + Number(item[opcao.key] ?? 0), 0),
  }));

  return (
    <Bloco titulo="Contas de resultado" className="overflow-hidden">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {resultadoOpcoes.map((opcao) => {
            const ativo = resultadosVisiveis.includes(opcao.key);
            return (
              <button
                key={opcao.key}
                type="button"
                onClick={() => onToggleResultado(opcao.key)}
                aria-pressed={ativo}
                className={cn(
                  "min-h-10 flex-1 rounded-full border px-4 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-w-52",
                  ativo ? opcao.activeClass : cn("border-transparent", opcao.softClass),
                )}
              >
                {opcao.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onTodosResultados}
            className="min-h-10 rounded-full border px-4 text-sm font-semibold text-muted-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Todos
          </button>
        </div>

        <div className="rounded-2xl bg-muted p-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {meses.map((nome, index) => {
              const ativo = mesesVisiveis.includes(index);
              return (
                <button
                  key={nome}
                  type="button"
                  onClick={() => onToggleMes(index)}
                  aria-pressed={ativo}
                  className={cn(
                    "min-h-9 rounded-full px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    ativo
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-card text-card-foreground hover:bg-accent",
                  )}
                >
                  {nome}
                </button>
              );
            })}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onMesAtual}
              className="min-h-9 rounded-full px-3 text-sm font-semibold text-muted-foreground transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Mês atual
            </button>
            <button
              type="button"
              onClick={onTodosMeses}
              className="min-h-9 rounded-full px-3 text-sm font-semibold text-muted-foreground transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Ano todo
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-h-[420px] overflow-x-auto rounded-lg border bg-background/40 p-3">
            <div className="h-[400px] min-w-[720px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dados} margin={{ top: 34, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <ReferenceLine y={0} stroke="var(--foreground)" strokeOpacity={0.35} />
                  <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis
                    tickFormatter={(v) => brl(Number(v), true)}
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    width={86}
                  />
                  <Tooltip formatter={(v) => brl(Number(v))} cursor={{ fill: "var(--muted)" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {resultadoOpcoes
                    .filter((opcao) => resultadosVisiveis.includes(opcao.key))
                    .map((opcao) => (
                      <Bar
                        key={opcao.key}
                        dataKey={opcao.key}
                        name={opcao.label}
                        fill={opcao.fill}
                        radius={[6, 6, 0, 0]}
                        maxBarSize={72}
                      >
                        <LabelList
                          dataKey={opcao.key}
                          position="top"
                          formatter={(value: unknown) => brl(Number(value), true)}
                          className="fill-foreground text-[11px] font-semibold"
                        />
                      </Bar>
                    ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <dl className="grid content-start gap-3 sm:grid-cols-3 xl:grid-cols-1">
            {totais.map((item) => {
              const ativo = resultadosVisiveis.includes(item.key);
              return (
                <div
                  key={item.key}
                  className={cn(
                    "rounded-lg border p-3",
                    ativo ? item.softClass : "bg-muted/50 text-muted-foreground",
                  )}
                >
                  <dt className="text-xs font-medium uppercase">{item.label}</dt>
                  <dd className="tabular mt-1 text-lg font-semibold">{brl(item.total)}</dd>
                  <p className="mt-1 text-xs">
                    {mesesVisiveis.length === 1
                      ? nomeMes(mesesVisiveis[0] ?? 0)
                      : `${mesesVisiveis.length} meses`}
                  </p>
                </div>
              );
            })}
          </dl>
        </div>
      </div>
    </Bloco>
  );
}

type InvestimentoGrafico = {
  mes: string;
  grupo4: number;
  grupo5: number;
  saldo: number;
};

type CategoriaFinanceira = {
  nome: string;
  total: number;
  mesesComValor: number;
};

function categoriasPorGrupo(
  linhas: LinhaCategoria[],
  grupo: GrupoDre,
  mesesVisiveis: number[],
): CategoriaFinanceira[] {
  return linhas
    .filter((linha) => linha.grupo === grupo)
    .map((linha) => {
      const valores = mesesVisiveis.map((mesIndex) => linha.valores[mesIndex] ?? 0);
      return {
        nome: linha.nome,
        total: valores.reduce((s, valor) => s + valor, 0),
        mesesComValor: valores.filter((valor) => valor !== 0).length,
      };
    })
    .filter((linha) => linha.mesesComValor > 0)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

function GraficoInvestimentos({
  dados,
  mesesVisiveis,
}: {
  dados: InvestimentoGrafico[];
  mesesVisiveis: number[];
}) {
  const totalGrupo4 = dados.reduce((s, item) => s + item.grupo4, 0);
  const totalGrupo5 = dados.reduce((s, item) => s + item.grupo5, 0);
  const saldo = totalGrupo4 + totalGrupo5;

  return (
    <Bloco titulo="Investimentos e financiamentos" className="overflow-hidden">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-h-[320px] overflow-x-auto rounded-lg border bg-background/40 p-3">
          <div className="h-[300px] min-w-[640px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dados} margin={{ top: 28, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <ReferenceLine y={0} stroke="var(--foreground)" strokeOpacity={0.35} />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  tickFormatter={(v) => brl(Number(v), true)}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={86}
                />
                <Tooltip formatter={(v) => brl(Number(v))} cursor={{ fill: "var(--muted)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="grupo4" name="Investimento" radius={[6, 6, 0, 0]} maxBarSize={70}>
                  {dados.map((item) => (
                    <Cell key={`grupo4-${item.mes}`} fill={corPorSinal(item.grupo4)} />
                  ))}
                  <LabelList
                    dataKey="grupo4"
                    position="top"
                    formatter={(value: unknown) => labelMoeda(value)}
                    className="fill-foreground text-[11px] font-semibold"
                  />
                </Bar>
                <Bar dataKey="grupo5" name="Financiamento" radius={[6, 6, 0, 0]} maxBarSize={70}>
                  {dados.map((item) => (
                    <Cell key={`grupo5-${item.mes}`} fill={corPorSinal(item.grupo5)} />
                  ))}
                  <LabelList
                    dataKey="grupo5"
                    position="top"
                    formatter={(value: unknown) => labelMoeda(value)}
                    className="fill-foreground text-[11px] font-semibold"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <dl className="grid content-start gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <ResumoInvestimento
            rotulo="Investimento"
            descricao="Atividade de investimento"
            valor={totalGrupo4}
          />
          <ResumoInvestimento
            rotulo="Financiamento"
            descricao="Atividade de financiamento"
            valor={totalGrupo5}
          />
          <ResumoInvestimento
            rotulo="Saldo"
            descricao={
              mesesVisiveis.length === 1
                ? nomeMes(mesesVisiveis[0] ?? 0)
                : `${mesesVisiveis.length} meses`
            }
            valor={saldo}
          />
        </dl>
      </div>
    </Bloco>
  );
}

function BlocoCategoriasFinanceiras({
  titulo,
  categorias,
}: {
  titulo: string;
  categorias: CategoriaFinanceira[];
}) {
  const total = categorias.reduce((s, categoria) => s + categoria.total, 0);

  return (
    <Bloco titulo={titulo}>
      {categorias.length === 0 ? (
        <SemDados mensagem="Nenhuma categoria encontrada no período selecionado." />
      ) : (
        <div className="space-y-4">
          <div
            className={cn(
              "rounded-lg border p-3",
              total >= 0 ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative",
            )}
          >
            <p className="text-xs font-medium uppercase">Total do período</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="tabular text-xl font-semibold">{brl(total)}</p>
              <BadgeSinal valor={total} />
            </div>
          </div>

          <ul className="space-y-2">
            {categorias.map((categoria) => (
              <li
                key={categoria.nome}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{categoria.nome}</span>
                  <span className="block text-xs text-muted-foreground">
                    {categoria.mesesComValor === 1
                      ? "1 mês com movimento"
                      : `${categoria.mesesComValor} meses com movimento`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <BadgeSinal valor={categoria.total} />
                  <span
                    className={cn(
                      "tabular rounded-full px-2 py-0.5 text-xs font-semibold",
                      categoria.total >= 0
                        ? "bg-positive-soft text-positive"
                        : "bg-negative-soft text-negative",
                    )}
                  >
                    {brl(categoria.total, true)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Bloco>
  );
}

function ResumoInvestimento({
  rotulo,
  descricao,
  valor,
}: {
  rotulo: string;
  descricao: string;
  valor: number;
}) {
  const positivo = valor >= 0;

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        positivo ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative",
      )}
    >
      <dt className="text-xs font-medium uppercase">{rotulo}</dt>
      <dd className="mt-1 flex flex-wrap items-center gap-2">
        <span className="tabular text-lg font-semibold">{brl(valor)}</span>
        <BadgeSinal valor={valor} />
      </dd>
      <p className="mt-1 text-xs">{descricao}</p>
    </div>
  );
}

function BadgeSinal({ valor }: { valor: number }) {
  const saida = valor < 0;

  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
        saida ? "bg-negative-soft text-negative" : "bg-positive-soft text-positive",
      )}
    >
      {saida ? "Saída" : "Entrada"}
    </span>
  );
}

function corPorSinal(valor: number) {
  if (valor > 0) return "var(--positive)";
  if (valor < 0) return "var(--negative)";
  return "var(--muted-foreground)";
}

function labelMoeda(value: unknown) {
  const numero = Number(value);
  return numero === 0 ? "" : brl(numero, true);
}

function nomeMes(index: number) {
  return meses[index] ?? `Mês ${index + 1}`;
}

function nomeMesCurto(index: number) {
  return mesesCurtos[index] ?? nomeMes(index);
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
