import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Bloco, SemDados, SemEmpresa } from "@/components/ui-blocos";
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

  function exportarCsv() {
    const cab = ["Linha", ...mesesVisiveis.map((i) => mesesCurtos[i]), "Total", "Média"];
    const corpo: string[][] = [];
    const push = (nome: string, pick: (m: ResultadoMes) => number) => {
      const vals = resultadosVisiveis.map(pick);
      corpo.push([
        nome,
        ...vals.map((v) => v.toFixed(2)),
        vals.reduce((s, v) => s + v, 0).toFixed(2),
        mediaFechados(resultadosVisiveis, pick).toFixed(2),
      ]);
    };
    push("Receita Operacional", (m) => m.receitaBruta);
    push("Custos Operacionais", (m) => -(m.deducoes + m.custos));
    push("Resultado Bruto", (m) => m.resultadoBruto);
    push("Despesas Operacionais", (m) => -m.despesas);
    push("Resultado Operacional", (m) => m.resultadoOperacional);
    push("Atividade de Investimento", (m) => m.financeiro);
    push("Resultado OP + Financeiro", (m) => m.resultadoOpFin);
    push("Atividade de Financiamento", (m) => m.naoOperacional);
    push("Resultado Líquido", (m) => m.resultadoLiquido);
    const csv = [cab, ...corpo].map((l) => l.join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `dre-gerencial-${ano}-${modoFiltro}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <TopBar
        titulo="DRE Gerencial"
        descricao={`Regime de caixa · exercício ${ano}`}
        acoes={
          <Button variant="outline" size="sm" onClick={exportarCsv} disabled={!empresaId}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
        }
      />
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

            <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
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
                      <td className="sticky left-0 bg-muted/30 px-4 py-2">Margem operacional</td>
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

            <div className="space-y-5">
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

              <Bloco titulo="Composição por grupo">
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
              </Bloco>

              {modoFiltro === "comparativo" && (
              <Bloco titulo="Comparativo">
                <div className="space-y-3">
                  <div className="rounded-md bg-secondary/60 p-3">
                    <p className="text-xs text-muted-foreground">Melhor resultado</p>
                    <p className="mt-1 text-sm font-semibold">{comparativo.vencedor}</p>
                    <p
                      className={cn(
                        "mt-1 text-xs",
                        comparativo.delta >= 0 ? "text-positive" : "text-negative",
                      )}
                    >
                      Diferença de {brl(Math.abs(comparativo.delta))}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <ResumoComparativo
                      nome={comparativo.nomeA}
                      valor={comparativo.a.resultadoLiquido}
                    />
                    <ResumoComparativo
                      nome={comparativo.nomeB}
                      valor={comparativo.b.resultadoLiquido}
                    />
                  </div>

                  <ul className="space-y-1 text-xs">
                    {comparativo.impactos.map((item) => (
                      <li key={item.nome} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 text-muted-foreground">{item.nome}</span>
                        <span
                          className={cn(
                            "shrink-0 tabular font-medium",
                            item.delta >= 0 ? "text-positive" : "text-negative",
                          )}
                        >
                          {item.delta >= 0 ? "+" : "-"}
                          {brl(Math.abs(item.delta))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Bloco>
              )}
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
      delta: -(a.deducoes + a.custos) - (-(b.deducoes + b.custos)),
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

function ResumoComparativo({ nome, valor }: { nome: string; valor: number }) {
  return (
    <div className="rounded-md border bg-card p-2">
      <p className="truncate text-muted-foreground">{nome}</p>
      <p className={cn("tabular font-semibold", valor >= 0 ? "text-positive" : "text-negative")}>
        {brl(valor)}
      </p>
    </div>
  );
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
          {m.temMovimento ? (
            <ValorComPercentual valor={v} base={m.receitaBruta} />
          ) : (
            "—"
          )}
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
    valores: mesesVisiveis.map(
      (i) => itens.reduce((s, item) => s + (item.valores[i] ?? 0), 0),
    ),
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
            {m.temMovimento ? (
              <ValorComPercentual valor={v} base={m.receitaBruta} />
            ) : (
              "—"
            )}
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
                    <td key={mesLinha} className={cn("tabular px-3 py-1.5 text-right", celaValor(v))}>
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
                const somaFilho =
                  mesesVisiveis.reduce((s, i) => s + (f.valores[i] ?? 0), 0);
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
                        <td key={i} className="tabular px-3 py-1.5 text-right text-muted-foreground">
                          {v ? (
                            <ValorComPercentual
                              valor={v}
                              base={resultados[i]?.receitaBruta ?? 0}
                            />
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
