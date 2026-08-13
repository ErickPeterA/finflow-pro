import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Bloco, SemDados, SemEmpresa } from "@/components/ui-blocos";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/lib/app-context";
import { useCategorias, useConfiguracao, useLancamentos } from "@/lib/data";
import {
  agregarPorCentroCategoria,
  calcularDre,
  mediaFechados,
  type GrupoDre,
  type LinhaCentroCategoria,
  type ResultadoMes,
} from "@/lib/dre";
import { gerarAlertas } from "@/lib/insights";
import { brl, meses, mesesCurtos, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dre")({
  head: () => ({
    meta: [
      { title: "DRE Gerencial | Ecossistema Financeiro BPO" },
      {
        name: "description",
        content:
          "DRE gerencial por regime de caixa, mês a mês, com abertura por categoria, médias e margens.",
      },
      { property: "og:title", content: "DRE Gerencial | Ecossistema Financeiro BPO" },
      {
        property: "og:description",
        content: "Demonstrativo técnico completo com todas as linhas do resultado.",
      },
    ],
  }),
  component: DrePage,
});

type ModoFiltro = "ano" | "mes" | "periodo" | "comparativo";
type ModoComparativo = "meses" | "anos";

const todosMeses = Array.from({ length: 12 }, (_, i) => i);

function DrePage() {
  const { empresaId, ano, setAno, mes, setMes } = useApp();
  const anoAtual = new Date().getFullYear();
  const anosFiltro = [anoAtual + 1, anoAtual, anoAtual - 1, anoAtual - 2, anoAtual - 3];
  const [modoFiltro, setModoFiltro] = useState<ModoFiltro>("ano");
  const [mesFiltro, setMesFiltro] = useState(mes);
  const [periodoInicio, setPeriodoInicio] = useState(`${ano}-01-01`);
  const [periodoFim, setPeriodoFim] = useState(`${ano}-12-31`);
  const [modoComparativo, setModoComparativo] = useState<ModoComparativo>("meses");
  const [mesComparativoA, setMesComparativoA] = useState(mes);
  const [mesComparativoB, setMesComparativoB] = useState(Math.max(0, mes - 1));
  const [anoComparativoA, setAnoComparativoA] = useState(ano);
  const [anoComparativoB, setAnoComparativoB] = useState(ano - 1);
  const anosOpcoes = Array.from(
    new Set([...anosFiltro, ano, anoComparativoA, anoComparativoB]),
  ).sort((a, b) => b - a);
  const { data: lancamentos = [], isLoading } = useLancamentos(empresaId, ano);
  const { data: lancamentosAnoA = [] } = useLancamentos(empresaId, anoComparativoA);
  const { data: lancamentosAnoB = [] } = useLancamentos(empresaId, anoComparativoB);
  const { data: categorias = [] } = useCategorias(empresaId);
  const { data: config } = useConfiguracao(empresaId);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setMesFiltro(mes);
  }, [mes]);

  useEffect(() => {
    setPeriodoInicio(`${ano}-01-01`);
    setPeriodoFim(`${ano}-12-31`);
    setAnoComparativoA(ano);
    setAnoComparativoB(ano - 1);
  }, [ano]);

  const lancamentosFiltrados = useMemo(
    () =>
      lancamentos.filter((l) => {
        if (modoFiltro === "mes") {
          return Number(l.competencia.slice(5, 7)) - 1 === mesFiltro;
        }
        if (modoFiltro === "periodo") {
          const data = l.data_efetiva?.slice(0, 10);
          const inicio = periodoInicio || `${ano}-01-01`;
          const fim = periodoFim || `${ano}-12-31`;
          return data >= inicio && data <= fim;
        }
        return true;
      }),
    [lancamentos, modoFiltro, mesFiltro, periodoInicio, periodoFim, ano],
  );

  const resultadosAno = useMemo(
    () => calcularDre(lancamentos, categorias),
    [lancamentos, categorias],
  );
  const resultados = useMemo(
    () => calcularDre(lancamentosFiltrados, categorias),
    [lancamentosFiltrados, categorias],
  );
  const mesesVisiveis = useMemo(() => {
    if (modoFiltro === "mes") return [mesFiltro];
    if (modoFiltro === "periodo") return mesesDoPeriodo(periodoInicio, periodoFim, ano);
    return todosMeses;
  }, [modoFiltro, mesFiltro, periodoInicio, periodoFim, ano]);
  const resultadosVisiveis = useMemo(
    () => mesesVisiveis.map((i) => resultados[i]!),
    [mesesVisiveis, resultados],
  );
  const linhas = useMemo(
    () => agregarPorCentroCategoria(lancamentosFiltrados, categorias),
    [lancamentosFiltrados, categorias],
  );
  const alertas = useMemo(
    () =>
      gerarAlertas(
        resultados,
        lancamentosFiltrados,
        categorias,
        modoFiltro === "mes" ? mesFiltro : mes,
        undefined,
        Number(config?.margem_desejada ?? 15),
      ),
    [resultados, lancamentosFiltrados, categorias, mes, mesFiltro, modoFiltro, config],
  );
  const atual = totalizarResultados(resultadosVisiveis);
  const resultadosAnoA = useMemo(
    () => calcularDre(lancamentosAnoA, categorias),
    [lancamentosAnoA, categorias],
  );
  const resultadosAnoB = useMemo(
    () => calcularDre(lancamentosAnoB, categorias),
    [lancamentosAnoB, categorias],
  );
  const comparativo = useMemo(() => {
    if (modoComparativo === "anos") {
      return compararResultados(
        `${anoComparativoA}`,
        totalizarResultados(resultadosAnoA),
        `${anoComparativoB}`,
        totalizarResultados(resultadosAnoB),
      );
    }
    return compararResultados(
      meses[mesComparativoA],
      resultadosAno[mesComparativoA]!,
      meses[mesComparativoB],
      resultadosAno[mesComparativoB]!,
    );
  }, [
    modoComparativo,
    anoComparativoA,
    anoComparativoB,
    resultadosAnoA,
    resultadosAnoB,
    mesComparativoA,
    mesComparativoB,
    resultadosAno,
  ]);
  const linhasComparativo = useMemo(
    () => montarLinhasComparativo(comparativo.a, comparativo.b),
    [comparativo],
  );
  const detalhesComparativo = useMemo(() => {
    if (modoComparativo === "anos") {
      return montarDetalhesComparativo(
        agregarPorCentroCategoria(lancamentosAnoA, categorias),
        agregarPorCentroCategoria(lancamentosAnoB, categorias),
        todosMeses,
        todosMeses,
        comparativo.a,
        comparativo.b,
      );
    }

    const linhasAno = agregarPorCentroCategoria(lancamentos, categorias);
    return montarDetalhesComparativo(
      linhasAno,
      linhasAno,
      [mesComparativoA],
      [mesComparativoB],
      comparativo.a,
      comparativo.b,
    );
  }, [
    modoComparativo,
    lancamentosAnoA,
    lancamentosAnoB,
    lancamentos,
    categorias,
    mesComparativoA,
    mesComparativoB,
    comparativo,
  ]);
  const composicaoGrupo = [
    {
      nome: "Receita Operacional",
      valor: atual.receitaBruta,
      tipo: "entrada",
    },
    {
      nome: "Custos Operacionais",
      valor: -(atual.deducoes + atual.custos),
      tipo: "saida",
    },
    {
      nome: "Resultado Bruto",
      valor: atual.resultadoBruto,
      tipo: "resultado",
    },
    {
      nome: "Despesas Operacionais",
      valor: -atual.despesas,
      tipo: "saida",
    },
    {
      nome: "Resultado Operacional",
      valor: atual.resultadoOperacional,
      tipo: "resultado",
      forte: true,
    },
    {
      nome: "Atividade de Investimento",
      valor: atual.financeiro,
      tipo: "entrada",
    },
    {
      nome: "Operacional + Financeiro",
      valor: atual.resultadoOpFin,
      tipo: "resultado",
    },
    {
      nome: "Resultado Líquido",
      valor: atual.resultadoLiquido,
      tipo: "resultado",
      forte: true,
    },
  ];

  function alternar(k: string) {
    setAbertos((a) => ({ ...a, [k]: !a[k] }));
  }

  return (
    <>
      <TopBar titulo="DRE Gerencial" descricao={`Regime de caixa · exercício ${ano}`} />
      <main className="space-y-5 p-6">
        {!empresaId ? (
          <SemEmpresa />
        ) : isLoading ? (
          <SemDados mensagem="Carregando lançamentos..." />
        ) : (
          <>
            <Bloco titulo="Filtros do DRE">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Ano</p>
                  <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {anosOpcoes.map((a) => (
                        <SelectItem key={a} value={String(a)}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Visualização</p>
                  <Select value={modoFiltro} onValueChange={(v) => setModoFiltro(v as ModoFiltro)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ano">Ano inteiro</SelectItem>
                      <SelectItem value="mes">Mês</SelectItem>
                      <SelectItem value="periodo">Período</SelectItem>
                      <SelectItem value="comparativo">Comparativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {modoFiltro === "comparativo" ? "Comparar por" : "Mês"}
                  </p>
                  {modoFiltro === "comparativo" ? (
                    <Select
                      value={modoComparativo}
                      onValueChange={(v) => setModoComparativo(v as ModoComparativo)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="meses">Meses</SelectItem>
                        <SelectItem value="anos">Anos</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select
                      value={String(mesFiltro)}
                      onValueChange={(v) => {
                        const novoMes = Number(v);
                        setMesFiltro(novoMes);
                        setMes(novoMes);
                      }}
                      disabled={modoFiltro !== "mes"}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {meses.map((m, i) => (
                          <SelectItem key={m} value={String(i)}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {modoFiltro === "comparativo"
                      ? modoComparativo === "meses"
                        ? "Mês A"
                        : "Ano A"
                      : "De"}
                  </p>
                  {modoFiltro === "comparativo" ? (
                    modoComparativo === "meses" ? (
                      <Select
                        value={String(mesComparativoA)}
                        onValueChange={(v) => setMesComparativoA(Number(v))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {meses.map((m, i) => (
                            <SelectItem key={m} value={String(i)}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        value={String(anoComparativoA)}
                        onValueChange={(v) => setAnoComparativoA(Number(v))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {anosOpcoes.map((a) => (
                            <SelectItem key={a} value={String(a)}>
                              {a}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )
                  ) : (
                    <Input
                      type="date"
                      value={periodoInicio}
                      onChange={(e) => setPeriodoInicio(e.target.value)}
                      disabled={modoFiltro !== "periodo"}
                      className="h-9"
                    />
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {modoFiltro === "comparativo"
                      ? modoComparativo === "meses"
                        ? "Mês B"
                        : "Ano B"
                      : "Até"}
                  </p>
                  {modoFiltro === "comparativo" ? (
                    modoComparativo === "meses" ? (
                      <Select
                        value={String(mesComparativoB)}
                        onValueChange={(v) => setMesComparativoB(Number(v))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {meses.map((m, i) => (
                            <SelectItem key={m} value={String(i)}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        value={String(anoComparativoB)}
                        onValueChange={(v) => setAnoComparativoB(Number(v))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {anosOpcoes.map((a) => (
                            <SelectItem key={a} value={String(a)}>
                              {a}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )
                  ) : (
                    <Input
                      type="date"
                      value={periodoFim}
                      onChange={(e) => setPeriodoFim(e.target.value)}
                      disabled={modoFiltro !== "periodo"}
                      className="h-9"
                    />
                  )}
                </div>
              </div>
            </Bloco>

            <div className="space-y-5">
              {modoFiltro === "comparativo" ? (
                <Bloco
                  titulo={`Demonstrativo comparativo: ${comparativo.nomeA} x ${comparativo.nomeB}`}
                  className="overflow-hidden"
                >
                  <TabelaComparativa
                    comparativo={comparativo}
                    linhas={linhasComparativo}
                    detalhes={detalhesComparativo}
                    abertos={abertos}
                    onToggle={alternar}
                  />
                </Bloco>
              ) : (
                <Bloco titulo={`Demonstrativo ${ano}`} className="overflow-hidden">
                  <div className="-mx-5 -mb-5 overflow-x-auto">
                    <table className="w-full min-w-[1100px] text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="sticky left-0 z-10 bg-muted/50 px-4 py-2 text-left font-medium">
                            Linha
                          </th>
                          {mesesVisiveis.map((i) => (
                            <th
                              key={i}
                              className={cn(
                                "px-3 py-2 text-right font-medium",
                                i === mes && "text-foreground",
                              )}
                            >
                              {mesesCurtos[i]}
                            </th>
                          ))}
                          <th className="px-3 py-2 text-right font-medium">Total</th>
                          <th className="px-4 py-2 text-right font-medium">Média</th>
                        </tr>
                      </thead>
                      <tbody>
                        <LinhaTotal
                          nome="Receita Operacional"
                          resultados={resultados}
                          mesesVisiveis={mesesVisiveis}
                          pick={(m) => m.receitaBruta}
                          grupos={["receita_operacional"]}
                          linhas={linhas}
                          aberto={!!abertos["receita_operacional"]}
                          onToggle={() => alternar("receita_operacional")}
                        />
                        <LinhaTotal
                          nome="(-) Custos Operacionais"
                          resultados={resultados}
                          mesesVisiveis={mesesVisiveis}
                          pick={(m) => -(m.deducoes + m.custos)}
                          grupos={["deducoes", "custos"]}
                          linhas={linhas}
                          aberto={!!abertos["custos"]}
                          onToggle={() => alternar("custos")}
                        />
                        <LinhaResumo
                          nome="= Resultado Bruto"
                          resultados={resultados}
                          mesesVisiveis={mesesVisiveis}
                          pick={(m) => m.resultadoBruto}
                        />
                        <LinhaTotal
                          nome="(-) Despesas Operacionais"
                          resultados={resultados}
                          mesesVisiveis={mesesVisiveis}
                          pick={(m) => -m.despesas}
                          grupos={["despesas"]}
                          linhas={linhas}
                          aberto={!!abertos["despesas"]}
                          onToggle={() => alternar("despesas")}
                        />
                        <LinhaResumo
                          nome="= Resultado Operacional"
                          resultados={resultados}
                          mesesVisiveis={mesesVisiveis}
                          pick={(m) => m.resultadoOperacional}
                          forte
                        />
                        <LinhaTotal
                          nome="(+/-) Atividade de Investimento"
                          resultados={resultados}
                          mesesVisiveis={mesesVisiveis}
                          pick={(m) => m.financeiro}
                          grupos={["financeiro"]}
                          linhas={linhas}
                          aberto={!!abertos["financeiro"]}
                          onToggle={() => alternar("financeiro")}
                        />
                        <LinhaResumo
                          nome="= Operacional + Financeiro"
                          resultados={resultados}
                          mesesVisiveis={mesesVisiveis}
                          pick={(m) => m.resultadoOpFin}
                        />
                        <LinhaTotal
                          nome="(+/-) Atividade de Financiamento"
                          resultados={resultados}
                          mesesVisiveis={mesesVisiveis}
                          pick={(m) => m.naoOperacional}
                          grupos={["nao_operacional"]}
                          linhas={linhas}
                          aberto={!!abertos["nao_operacional"]}
                          onToggle={() => alternar("nao_operacional")}
                        />
                        <LinhaResumo
                          nome="= Resultado Líquido"
                          resultados={resultados}
                          mesesVisiveis={mesesVisiveis}
                          pick={(m) => m.resultadoLiquido}
                          forte
                        />
                        <tr className="border-t bg-muted/30 text-xs text-muted-foreground">
                          <td className="sticky left-0 bg-muted/30 px-4 py-2">
                            Margem operacional
                          </td>
                          {resultadosVisiveis.map((m) => (
                            <td key={m.mes} className="tabular px-3 py-2 text-right">
                              {m.temMovimento ? pct(m.margemOperacional) : "—"}
                            </td>
                          ))}
                          <td className="px-3 py-2" />
                          <td className="tabular px-4 py-2 text-right">
                            {pct(mediaFechados(resultadosVisiveis, (m) => m.margemOperacional))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Bloco>
              )}

              <div className="grid items-start gap-5 xl:grid-cols-2">
                {modoFiltro !== "comparativo" && (
                  <Bloco titulo="Leitura do período">
                    {alertas.length === 0 ? (
                      <SemDados mensagem="Sem observações para o mês." />
                    ) : (
                      <ul className="space-y-3">
                        {alertas.map((a) => (
                          <li
                            key={a.titulo}
                            className={cn(
                              "rounded-lg border-l-4 bg-muted/40 px-3 py-2",
                              a.nivel === "positivo" && "border-l-positive",
                              a.nivel === "negativo" && "border-l-negative",
                              a.nivel === "atencao" && "border-l-warning",
                              a.nivel === "neutro" && "border-l-info",
                            )}
                          >
                            <p className="text-sm font-medium">{a.titulo}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{a.detalhe}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Bloco>
                )}

                <Bloco
                  titulo="Composição por grupo"
                  className={cn(modoFiltro === "comparativo" && "xl:col-span-2")}
                >
                  {modoFiltro === "comparativo" ? (
                    <ComposicaoComparativa comparativo={comparativo} />
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {composicaoGrupo.map((item) => (
                        <li
                          key={item.nome}
                          className={cn(
                            "flex items-center justify-between gap-2 rounded-md px-2 py-1",
                            item.tipo === "resultado" && "bg-secondary/50",
                            item.forte && "bg-secondary font-semibold",
                          )}
                        >
                          <span
                            className={cn(
                              "min-w-0 text-muted-foreground",
                              item.tipo === "resultado" && "text-foreground",
                            )}
                          >
                            {item.nome}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 tabular text-right font-medium",
                              item.valor < 0
                                ? "text-negative"
                                : item.tipo === "resultado" && item.valor > 0
                                  ? "text-positive"
                                  : "text-foreground",
                            )}
                          >
                            {brl(item.valor)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Bloco>
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function mesesDoPeriodo(inicio: string, fim: string, ano: number) {
  if (!inicio || !fim) return todosMeses;
  const [de, ate] = inicio <= fim ? [inicio, fim] : [fim, inicio];
  const mesesNoPeriodo = todosMeses.filter((mesIndex) => {
    const mesNumero = String(mesIndex + 1).padStart(2, "0");
    const primeiroDia = `${ano}-${mesNumero}-01`;
    const ultimoDiaNumero = new Date(ano, mesIndex + 1, 0).getDate();
    const ultimoDia = `${ano}-${mesNumero}-${String(ultimoDiaNumero).padStart(2, "0")}`;
    return primeiroDia <= ate && ultimoDia >= de;
  });
  return mesesNoPeriodo.length ? mesesNoPeriodo : todosMeses;
}

function totalizarResultados(resultados: ResultadoMes[]): ResultadoMes {
  const total = resultados.reduce(
    (acc, m) => ({
      ...acc,
      receitaBruta: acc.receitaBruta + m.receitaBruta,
      deducoes: acc.deducoes + m.deducoes,
      receitaLiquida: acc.receitaLiquida + m.receitaLiquida,
      custos: acc.custos + m.custos,
      resultadoBruto: acc.resultadoBruto + m.resultadoBruto,
      despesas: acc.despesas + m.despesas,
      resultadoOperacional: acc.resultadoOperacional + m.resultadoOperacional,
      financeiro: acc.financeiro + m.financeiro,
      resultadoOpFin: acc.resultadoOpFin + m.resultadoOpFin,
      naoOperacional: acc.naoOperacional + m.naoOperacional,
      aportesEmprestimos: acc.aportesEmprestimos + m.aportesEmprestimos,
      resultadoLiquido: acc.resultadoLiquido + m.resultadoLiquido,
      temMovimento: acc.temMovimento || m.temMovimento,
    }),
    {
      mes: -1,
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
    } satisfies ResultadoMes,
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

function compararResultados(nomeA: string, a: ResultadoMes, nomeB: string, b: ResultadoMes) {
  const delta = a.resultadoLiquido - b.resultadoLiquido;
  const impactos = [
    { nome: "Receita operacional", delta: a.receitaBruta - b.receitaBruta },
    {
      nome: "Custos operacionais",
      delta: -(a.deducoes + a.custos) - -(b.deducoes + b.custos),
    },
    { nome: "Despesas operacionais", delta: -a.despesas - -b.despesas },
    { nome: "Investimento", delta: a.financeiro - b.financeiro },
    { nome: "Financiamento", delta: a.naoOperacional - b.naoOperacional },
  ]
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, 4);

  return {
    nomeA,
    nomeB,
    a,
    b,
    delta,
    vencedor: delta === 0 ? "Empate" : delta > 0 ? nomeA : nomeB,
    impactos,
  };
}

type UnidadeComparativo = "moeda" | "percentual";

type LinhaComparativoBase = {
  nome: string;
  a: number;
  b: number;
  delta: number;
  variacaoPct: number | null;
  participacaoA: number | null;
  participacaoB: number | null;
  unidade: UnidadeComparativo;
};

type LinhaComparativo = LinhaComparativoBase & {
  forte?: boolean;
  grupos?: GrupoDre[];
};

type LinhaDetalheComparativo = LinhaComparativoBase & {
  key: string;
  grupo: GrupoDre;
  nivel: "centro" | "categoria";
  centroCusto?: string;
  classificacao?: "fixo" | "variavel";
};

function montarLinhasComparativo(a: ResultadoMes, b: ResultadoMes): LinhaComparativo[] {
  const linha = (
    nome: string,
    valorA: number,
    valorB: number,
    unidade: UnidadeComparativo = "moeda",
    forte = false,
    grupos?: GrupoDre[],
  ): LinhaComparativo => ({
    nome,
    a: valorA,
    b: valorB,
    delta: valorA - valorB,
    variacaoPct: unidade === "moeda" ? variacaoPercentual(valorA, valorB) : null,
    participacaoA: unidade === "moeda" ? percentualParticipacao(valorA, a.receitaBruta) : null,
    participacaoB: unidade === "moeda" ? percentualParticipacao(valorB, b.receitaBruta) : null,
    unidade,
    forte,
    grupos,
  });

  return [
    linha("Receita Operacional", a.receitaBruta, b.receitaBruta, "moeda", false, [
      "receita_operacional",
    ]),
    linha(
      "(-) Custos Operacionais",
      -(a.deducoes + a.custos),
      -(b.deducoes + b.custos),
      "moeda",
      false,
      ["deducoes", "custos"],
    ),
    linha("= Resultado Bruto", a.resultadoBruto, b.resultadoBruto, "moeda", true),
    linha("(-) Despesas Operacionais", -a.despesas, -b.despesas, "moeda", false, ["despesas"]),
    linha("= Resultado Operacional", a.resultadoOperacional, b.resultadoOperacional, "moeda", true),
    linha("(+/-) Atividade de Investimento", a.financeiro, b.financeiro, "moeda", false, [
      "financeiro",
    ]),
    linha("= Operacional + Financeiro", a.resultadoOpFin, b.resultadoOpFin, "moeda", true),
    linha("(+/-) Atividade de Financiamento", a.naoOperacional, b.naoOperacional, "moeda", false, [
      "nao_operacional",
    ]),
    linha("= Resultado Líquido", a.resultadoLiquido, b.resultadoLiquido, "moeda", true),
    linha("Margem Bruta", a.margemBruta, b.margemBruta, "percentual"),
    linha("Margem Operacional", a.margemOperacional, b.margemOperacional, "percentual", true),
    linha("Margem Líquida", a.margemLiquida, b.margemLiquida, "percentual"),
  ];
}

function montarDetalhesComparativo(
  linhasA: LinhaCentroCategoria[],
  linhasB: LinhaCentroCategoria[],
  mesesA: number[],
  mesesB: number[],
  totalA: ResultadoMes,
  totalB: ResultadoMes,
): LinhaDetalheComparativo[] {
  const itens = new Map<
    string,
    {
      nome: string;
      grupo: GrupoDre;
      centroCusto: string;
      classificacao: "fixo" | "variavel";
      a: number;
      b: number;
    }
  >();

  const acumular = (
    linhas: LinhaCentroCategoria[],
    mesesSelecionados: number[],
    lado: "a" | "b",
  ) => {
    for (const linha of linhas) {
      const valor = mesesSelecionados.reduce(
        (s, mesIndex) => s + (linha.valores[mesIndex] ?? 0),
        0,
      );
      if (!valor) continue;
      const key = `${linha.grupo}::${linha.centroCusto}::${linha.nome}`;
      const atual = itens.get(key) ?? {
        nome: linha.nome,
        grupo: linha.grupo,
        centroCusto: linha.centroCusto,
        classificacao: linha.classificacao,
        a: 0,
        b: 0,
      };
      atual[lado] += valor;
      itens.set(key, atual);
    }
  };

  acumular(linhasA, mesesA, "a");
  acumular(linhasB, mesesB, "b");

  const porCentro = new Map<
    string,
    {
      grupo: GrupoDre;
      centroCusto: string;
      a: number;
      b: number;
      itens: Array<{
        nome: string;
        classificacao: "fixo" | "variavel";
        a: number;
        b: number;
      }>;
    }
  >();

  for (const item of itens.values()) {
    const key = `${item.grupo}::${item.centroCusto}`;
    const centro = porCentro.get(key) ?? {
      grupo: item.grupo,
      centroCusto: item.centroCusto,
      a: 0,
      b: 0,
      itens: [],
    };
    centro.a += item.a;
    centro.b += item.b;
    centro.itens.push({
      nome: item.nome,
      classificacao: item.classificacao,
      a: item.a,
      b: item.b,
    });
    porCentro.set(key, centro);
  }

  return [...porCentro.values()]
    .sort((x, y) => {
      const grupo = ordemGrupo(x.grupo) - ordemGrupo(y.grupo);
      if (grupo !== 0) return grupo;
      return x.centroCusto.localeCompare(y.centroCusto, "pt-BR");
    })
    .flatMap((centro) => {
      const linhasCentro: LinhaDetalheComparativo[] = [
        montarLinhaDetalheComparativo({
          key: `${centro.grupo}::${centro.centroCusto}`,
          nome: centro.centroCusto,
          grupo: centro.grupo,
          nivel: "centro",
          a: centro.a,
          b: centro.b,
          totalA,
          totalB,
        }),
      ];

      const categoriasCentro = centro.itens
        .sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b))
        .map((item) =>
          montarLinhaDetalheComparativo({
            key: `${centro.grupo}::${centro.centroCusto}::${item.nome}`,
            nome: item.nome,
            grupo: centro.grupo,
            nivel: "categoria",
            centroCusto: centro.centroCusto,
            classificacao: item.classificacao,
            a: item.a,
            b: item.b,
            totalA,
            totalB,
          }),
        );

      return [...linhasCentro, ...categoriasCentro];
    });
}

function montarLinhaDetalheComparativo({
  key,
  nome,
  grupo,
  nivel,
  centroCusto,
  classificacao,
  a,
  b,
  totalA,
  totalB,
}: {
  key: string;
  nome: string;
  grupo: GrupoDre;
  nivel: "centro" | "categoria";
  centroCusto?: string;
  classificacao?: "fixo" | "variavel";
  a: number;
  b: number;
  totalA: ResultadoMes;
  totalB: ResultadoMes;
}): LinhaDetalheComparativo {
  return {
    key,
    nome,
    grupo,
    nivel,
    centroCusto,
    classificacao,
    a,
    b,
    delta: a - b,
    variacaoPct: variacaoPercentual(a, b),
    participacaoA: percentualParticipacao(a, totalA.receitaBruta),
    participacaoB: percentualParticipacao(b, totalB.receitaBruta),
    unidade: "moeda",
  };
}

function ordemGrupo(grupo: GrupoDre) {
  return [
    "receita_operacional",
    "deducoes",
    "custos",
    "despesas",
    "financeiro",
    "nao_operacional",
  ].indexOf(grupo);
}

function variacaoPercentual(atual: number, base: number) {
  if (!base || !Number.isFinite(base)) return null;
  return ((atual - base) / Math.abs(base)) * 100;
}

function TabelaComparativa({
  comparativo,
  linhas,
  detalhes,
  abertos,
  onToggle,
}: {
  comparativo: ReturnType<typeof compararResultados>;
  linhas: LinhaComparativo[];
  detalhes: LinhaDetalheComparativo[];
  abertos: Record<string, boolean>;
  onToggle: (chave: string) => void;
}) {
  const maiorImpacto = Math.max(
    1,
    ...[...linhas, ...detalhes]
      .filter((linha) => linha.unidade === "moeda")
      .map((linha) => Math.abs(linha.delta)),
  );

  return (
    <div className="-mx-5 -mb-5 overflow-x-auto">
      <table className="w-full min-w-[1160px] text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <th className="sticky left-0 z-10 bg-muted/50 px-4 py-2 text-left font-medium">
              Linha
            </th>
            <th className="px-3 py-2 text-right font-medium">{comparativo.nomeA}</th>
            <th className="px-3 py-2 text-right font-medium">{comparativo.nomeB}</th>
            <th className="px-3 py-2 text-right font-medium">Variação</th>
            <th className="px-3 py-2 text-right font-medium">Var. %</th>
            <th className="px-3 py-2 text-right font-medium">% receita A</th>
            <th className="px-3 py-2 text-right font-medium">% receita B</th>
            <th className="px-4 py-2 text-left font-medium">Impacto</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => {
            const detalhesLinha = detalhes.filter((detalhe) =>
              linha.grupos?.includes(detalhe.grupo),
            );
            const chave = chaveLinhaComparativa(linha);
            const aberto = !!abertos[chave];

            return (
              <Fragment key={linha.nome}>
                <LinhaTabelaComparativa
                  linha={linha}
                  maiorImpacto={maiorImpacto}
                  detalhesCount={detalhesLinha.length}
                  aberto={aberto}
                  onToggle={
                    detalhesLinha.length > 0 && linha.grupos ? () => onToggle(chave) : undefined
                  }
                />
                {aberto &&
                  detalhesLinha.map((detalhe) => (
                    <LinhaTabelaComparativa
                      key={detalhe.key}
                      linha={detalhe}
                      maiorImpacto={maiorImpacto}
                    />
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LinhaTabelaComparativa({
  linha,
  maiorImpacto,
  detalhesCount,
  aberto,
  onToggle,
}: {
  linha: LinhaComparativo | LinhaDetalheComparativo;
  maiorImpacto: number;
  detalhesCount?: number;
  aberto?: boolean;
  onToggle?: () => void;
}) {
  const detalhe = "nivel" in linha;

  return (
    <tr
      className={cn(
        "border-b",
        detalhe && linha.nivel === "centro" && "bg-muted/30 text-xs font-semibold",
        detalhe && linha.nivel === "categoria" && "bg-muted/10 text-xs",
        !detalhe && (linha.forte ? "bg-secondary/60 font-semibold" : "hover:bg-muted/30"),
      )}
    >
      <td
        className={cn(
          "sticky left-0 z-10 px-4 py-2 font-medium",
          detalhe && linha.nivel === "centro" && "bg-muted/30 pl-8",
          detalhe && linha.nivel === "categoria" && "bg-muted/10 pl-14",
          !detalhe && (linha.forte ? "bg-secondary" : "bg-card"),
        )}
      >
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-1.5 text-left font-medium hover:text-info"
          >
            {aberto ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate">{linha.nome}</span>
            <span className="ml-1 text-xs text-muted-foreground">({detalhesCount})</span>
          </button>
        ) : (
          <span className="flex items-center gap-2">
            <span className="truncate">{linha.nome}</span>
            {detalhe && linha.nivel === "centro" && (
              <span className="shrink-0 rounded bg-info-soft px-1.5 py-0.5 text-[10px] font-medium text-info">
                Centro
              </span>
            )}
            {detalhe && linha.nivel === "categoria" && linha.classificacao && (
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                  linha.classificacao === "fixo"
                    ? "bg-info-soft text-info"
                    : "bg-warning-soft text-warning",
                )}
              >
                {linha.classificacao === "fixo" ? "Fixo" : "Variável"}
              </span>
            )}
          </span>
        )}
      </td>
      <td className={cn("tabular px-3 py-2 text-right", celaValor(linha.a))}>
        {formatarValorComparativo(linha.a, linha.unidade)}
      </td>
      <td className={cn("tabular px-3 py-2 text-right", celaValor(linha.b))}>
        {formatarValorComparativo(linha.b, linha.unidade)}
      </td>
      <td
        className={cn(
          "tabular px-3 py-2 text-right font-medium",
          linha.delta >= 0 ? "text-positive" : "text-negative",
        )}
      >
        {formatarDeltaComparativo(linha.delta, linha.unidade)}
      </td>
      <td className="tabular px-3 py-2 text-right text-muted-foreground">
        {linha.variacaoPct === null ? "—" : pct(linha.variacaoPct)}
      </td>
      <td className="tabular px-3 py-2 text-right text-muted-foreground">
        {linha.participacaoA === null ? "—" : pct(linha.participacaoA)}
      </td>
      <td className="tabular px-3 py-2 text-right text-muted-foreground">
        {linha.participacaoB === null ? "—" : pct(linha.participacaoB)}
      </td>
      <td className="px-4 py-2">
        {linha.unidade === "moeda" ? (
          <BarraImpacto delta={linha.delta} max={maiorImpacto} />
        ) : (
          <span className="text-xs text-muted-foreground">
            {formatarDeltaComparativo(linha.delta, linha.unidade)}
          </span>
        )}
      </td>
    </tr>
  );
}

function chaveLinhaComparativa(linha: LinhaComparativo) {
  return linha.grupos?.join("|") ?? linha.nome;
}

function BarraImpacto({ delta, max }: { delta: number; max: number }) {
  const largura = `${Math.max(6, (Math.abs(delta) / max) * 100)}%`;
  return (
    <div className="flex min-w-[160px] items-center gap-2">
      <div className="h-2 flex-1 rounded bg-muted">
        <div
          className={cn("h-2 rounded", delta >= 0 ? "bg-positive" : "bg-negative")}
          style={{ width: largura }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-xs tabular text-muted-foreground">
        {pct((Math.abs(delta) / max) * 100, 0)}
      </span>
    </div>
  );
}

function ComposicaoComparativa({
  comparativo,
}: {
  comparativo: ReturnType<typeof compararResultados>;
}) {
  const itensA = montarComposicaoResultado(comparativo.a);
  const itensB = montarComposicaoResultado(comparativo.b);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ColunaComposicaoPeriodo nome={comparativo.nomeA} itens={itensA} />
      <ColunaComposicaoPeriodo nome={comparativo.nomeB} itens={itensB} />
    </div>
  );
}

function ColunaComposicaoPeriodo({
  nome,
  itens,
}: {
  nome: string;
  itens: ReturnType<typeof montarComposicaoResultado>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{nome}</p>
      <ul className="space-y-1 text-xs">
        {itens.map((item) => (
          <li
            key={item.nome}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md px-2 py-1",
              item.tipo === "resultado" && "bg-secondary/50",
              item.forte && "bg-secondary font-semibold",
            )}
          >
            <span
              className={cn(
                "min-w-0 text-muted-foreground",
                item.tipo === "resultado" && "text-foreground",
              )}
            >
              {item.nome}
            </span>
            <span
              className={cn(
                "shrink-0 tabular text-right font-medium",
                item.valor < 0
                  ? "text-negative"
                  : item.tipo === "resultado" && item.valor > 0
                    ? "text-positive"
                    : "text-foreground",
              )}
            >
              {brl(item.valor)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function montarComposicaoResultado(resultado: ResultadoMes) {
  return [
    {
      nome: "Receita Operacional",
      valor: resultado.receitaBruta,
      tipo: "entrada",
    },
    {
      nome: "Custos Operacionais",
      valor: -(resultado.deducoes + resultado.custos),
      tipo: "saida",
    },
    {
      nome: "Resultado Bruto",
      valor: resultado.resultadoBruto,
      tipo: "resultado",
    },
    {
      nome: "Despesas Operacionais",
      valor: -resultado.despesas,
      tipo: "saida",
    },
    {
      nome: "Resultado Operacional",
      valor: resultado.resultadoOperacional,
      tipo: "resultado",
      forte: true,
    },
    {
      nome: "Atividade de Investimento",
      valor: resultado.financeiro,
      tipo: "entrada",
    },
    {
      nome: "Operacional + Financeiro",
      valor: resultado.resultadoOpFin,
      tipo: "resultado",
    },
    {
      nome: "Resultado Líquido",
      valor: resultado.resultadoLiquido,
      tipo: "resultado",
      forte: true,
    },
  ];
}

function formatarValorComparativo(valor: number, unidade: UnidadeComparativo) {
  return unidade === "percentual" ? pct(valor) : brl(valor);
}

function formatarDeltaComparativo(delta: number, unidade: UnidadeComparativo) {
  const sinal = delta > 0 ? "+" : delta < 0 ? "-" : "";
  const valor =
    unidade === "percentual"
      ? `${Math.abs(delta).toFixed(1).replace(".", ",")} p.p.`
      : brl(Math.abs(delta));
  return `${sinal}${valor}`;
}

function celaValor(v: number) {
  return v < 0 ? "text-negative" : v > 0 ? "text-foreground" : "text-muted-foreground";
}

function percentualParticipacao(valor: number, base: number) {
  if (!base || !Number.isFinite(base)) return null;
  return (valor / base) * 100;
}

function ValorComPercentual({
  valor,
  base,
  compact,
}: {
  valor: number;
  base: number;
  compact?: boolean;
}) {
  const percentual = percentualParticipacao(valor, base);
  return (
    <span className="inline-flex items-baseline justify-end gap-1.5 whitespace-nowrap">
      <span>{brl(valor, compact)}</span>
      {percentual !== null && (
        <span
          className={cn(
            "text-[10px] font-medium text-muted-foreground",
            percentual < 0 && "text-negative/80",
          )}
        >
          {pct(percentual)}
        </span>
      )}
    </span>
  );
}

function LinhaResumo({
  nome,
  resultados,
  mesesVisiveis,
  pick,
  forte,
}: {
  nome: string;
  resultados: ResultadoMes[];
  mesesVisiveis: number[];
  pick: (m: ResultadoMes) => number;
  forte?: boolean;
}) {
  const mesesDaLinha = mesesVisiveis.map((i) => resultados[i]!);
  const vals = mesesDaLinha.map(pick);
  const total = vals.reduce((s, v) => s + v, 0);
  const totalReceita = mesesDaLinha.reduce((s, m) => s + m.receitaBruta, 0);
  const mediaReceita = mediaFechados(mesesDaLinha, (m) => m.receitaBruta);
  const mediaValor = mediaFechados(mesesDaLinha, pick);
  return (
    <tr className={cn("border-b bg-secondary/60", forte && "bg-secondary font-semibold")}>
      <td className="sticky left-0 z-10 bg-secondary px-4 py-2 font-medium">{nome}</td>
      {vals.map((v, index) => {
        const m = mesesDaLinha[index]!;
        return (
          <td
            key={m.mes}
            className={cn(
              "tabular px-3 py-2 text-right",
              v < 0 ? "text-negative" : v > 0 ? "text-positive" : "text-muted-foreground",
            )}
          >
            {m.temMovimento ? <ValorComPercentual valor={v} base={m.receitaBruta} /> : "—"}
          </td>
        );
      })}
      <td className="tabular px-3 py-2 text-right font-medium">
        <ValorComPercentual valor={total} base={totalReceita} />
      </td>
      <td className="tabular px-4 py-2 text-right">
        <ValorComPercentual valor={mediaValor} base={mediaReceita} />
      </td>
    </tr>
  );
}

function LinhaTotal({
  nome,
  resultados,
  mesesVisiveis,
  pick,
  grupos,
  linhas,
  aberto,
  onToggle,
}: {
  nome: string;
  resultados: ResultadoMes[];
  mesesVisiveis: number[];
  pick: (m: ResultadoMes) => number;
  grupos: GrupoDre[];
  linhas: LinhaCentroCategoria[];
  aberto: boolean;
  onToggle: () => void;
}) {
  const mesesDaLinha = mesesVisiveis.map((i) => resultados[i]!);
  const vals = mesesDaLinha.map(pick);
  const total = vals.reduce((s, v) => s + v, 0);
  const totalReceita = mesesDaLinha.reduce((s, m) => s + m.receitaBruta, 0);
  const mediaReceita = mediaFechados(mesesDaLinha, (m) => m.receitaBruta);
  const mediaValor = mediaFechados(mesesDaLinha, pick);
  const filhos = linhas.filter((l) => grupos.includes(l.grupo));
  const centros = Array.from(
    filhos.reduce((mapa, filho) => {
      const lista = mapa.get(filho.centroCusto) ?? [];
      lista.push(filho);
      mapa.set(filho.centroCusto, lista);
      return mapa;
    }, new Map<string, LinhaCentroCategoria[]>()),
  ).map(([centroCusto, itens]) => ({
    centroCusto,
    itens,
    valores: mesesVisiveis.map((i) => itens.reduce((s, item) => s + (item.valores[i] ?? 0), 0)),
  }));

  return (
    <>
      <tr className="border-b hover:bg-muted/30">
        <td className="sticky left-0 z-10 bg-card px-4 py-2">
          <button
            onClick={onToggle}
            className="flex items-center gap-1.5 text-left font-medium hover:text-info"
          >
            {aberto ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            {nome}
            <span className="ml-1 text-xs text-muted-foreground">({filhos.length})</span>
          </button>
        </td>
        {vals.map((v, index) => {
          const m = mesesDaLinha[index]!;
          return (
            <td key={m.mes} className={cn("tabular px-3 py-2 text-right", celaValor(v))}>
              {m.temMovimento ? <ValorComPercentual valor={v} base={m.receitaBruta} /> : "—"}
            </td>
          );
        })}
        <td className="tabular px-3 py-2 text-right font-medium">
          <ValorComPercentual valor={total} base={totalReceita} />
        </td>
        <td className="tabular px-4 py-2 text-right">
          <ValorComPercentual valor={mediaValor} base={mediaReceita} />
        </td>
      </tr>
      {aberto &&
        centros.map((centro) => {
          const totalCentro = centro.valores.reduce((s, v) => s + v, 0);
          const mesesComValorCentro = centro.valores.filter((v) => v !== 0).length || 1;
          const mediaCentro = totalCentro / mesesComValorCentro;

          return (
            <Fragment key={centro.centroCusto}>
              <tr className="border-b bg-muted/30 text-xs font-semibold">
                <td className="sticky left-0 z-10 bg-muted/30 py-1.5 pl-8 pr-4">
                  <span className="flex items-center gap-2">
                    <span className="truncate">{centro.centroCusto}</span>
                    <span className="shrink-0 rounded bg-info-soft px-1.5 py-0.5 text-[10px] font-medium text-info">
                      Centro
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {centro.itens.length}
                    </span>
                  </span>
                </td>
                {centro.valores.map((v, index) => {
                  const mesLinha = mesesVisiveis[index]!;
                  return (
                    <td
                      key={mesLinha}
                      className={cn("tabular px-3 py-1.5 text-right", celaValor(v))}
                    >
                      {v ? (
                        <ValorComPercentual
                          valor={v}
                          base={resultados[mesLinha]?.receitaBruta ?? 0}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                  );
                })}
                <td className="tabular px-3 py-1.5 text-right">
                  <ValorComPercentual valor={totalCentro} base={totalReceita} />
                </td>
                <td className="tabular px-4 py-1.5 text-right text-muted-foreground">
                  <ValorComPercentual valor={mediaCentro} base={mediaReceita} />
                </td>
              </tr>
              {centro.itens.map((f) => {
                const somaFilho = mesesVisiveis.reduce((s, i) => s + (f.valores[i] ?? 0), 0);
                const mesesComValor =
                  mesesVisiveis.filter((i) => (f.valores[i] ?? 0) !== 0).length || 1;
                const mediaFilho = somaFilho / mesesComValor;

                return (
                  <tr key={`${f.centroCusto}::${f.nome}`} className="border-b bg-muted/10 text-xs">
                    <td className="sticky left-0 z-10 bg-muted/10 py-1.5 pl-14 pr-4">
                      <span className="flex items-center gap-2">
                        <span className="truncate">{f.nome}</span>
                        <span
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                            f.classificacao === "fixo"
                              ? "bg-info-soft text-info"
                              : "bg-warning-soft text-warning",
                          )}
                        >
                          {f.classificacao === "fixo" ? "Fixo" : "Variável"}
                        </span>
                      </span>
                    </td>
                    {mesesVisiveis.map((i) => {
                      const v = f.valores[i] ?? 0;
                      return (
                        <td
                          key={i}
                          className="tabular px-3 py-1.5 text-right text-muted-foreground"
                        >
                          {v ? (
                            <ValorComPercentual valor={v} base={resultados[i]?.receitaBruta ?? 0} />
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                    <td className="tabular px-3 py-1.5 text-right">
                      <ValorComPercentual valor={somaFilho} base={totalReceita} />
                    </td>
                    <td className="tabular px-4 py-1.5 text-right text-muted-foreground">
                      <ValorComPercentual valor={mediaFilho} base={mediaReceita} />
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          );
        })}
    </>
  );
}
