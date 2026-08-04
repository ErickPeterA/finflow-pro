import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Bloco, SemDados, SemEmpresa } from "@/components/ui-blocos";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/app-context";
import { useCategorias, useConfiguracao, useLancamentos } from "@/lib/data";
import {
  agregarPorCategoria,
  calcularDre,
  grupoLabels,
  mediaFechados,
  type GrupoDre,
  type LinhaCategoria,
  type ResultadoMes,
} from "@/lib/dre";
import { gerarAlertas } from "@/lib/insights";
import { brl, mesesCurtos, pct } from "@/lib/format";
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

const gruposOrdem: GrupoDre[] = [
  "receita_operacional",
  "deducoes",
  "custos",
  "despesas",
  "financeiro",
  "nao_operacional",
];

function DrePage() {
  const { empresaId, ano, mes } = useApp();
  const { data: lancamentos = [], isLoading } = useLancamentos(empresaId, ano);
  const { data: categorias = [] } = useCategorias(empresaId);
  const { data: config } = useConfiguracao(empresaId);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  const resultados = useMemo(() => calcularDre(lancamentos, categorias), [lancamentos, categorias]);
  const linhas = useMemo(
    () => agregarPorCategoria(lancamentos, categorias),
    [lancamentos, categorias],
  );
  const alertas = useMemo(
    () =>
      gerarAlertas(
        resultados,
        lancamentos,
        categorias,
        mes,
        undefined,
        Number(config?.margem_desejada ?? 15),
      ),
    [resultados, lancamentos, categorias, mes, config],
  );

  function alternar(k: string) {
    setAbertos((a) => ({ ...a, [k]: !a[k] }));
  }

  function exportarCsv() {
    const cab = ["Linha", ...mesesCurtos, "Total", "Média"];
    const corpo: string[][] = [];
    const push = (nome: string, pick: (m: ResultadoMes) => number) => {
      const vals = resultados.map(pick);
      corpo.push([
        nome,
        ...vals.map((v) => v.toFixed(2)),
        vals.reduce((s, v) => s + v, 0).toFixed(2),
        mediaFechados(resultados, pick).toFixed(2),
      ]);
    };
    push("Receita Operacional", (m) => m.receitaBruta);
    push("Deduções", (m) => -m.deducoes);
    push("Receita Líquida", (m) => m.receitaLiquida);
    push("Custos", (m) => -m.custos);
    push("Resultado Bruto", (m) => m.resultadoBruto);
    push("Despesas", (m) => -m.despesas);
    push("Resultado Operacional", (m) => m.resultadoOperacional);
    push("Resultado Financeiro", (m) => m.financeiro);
    push("Não Operacional", (m) => m.naoOperacional);
    push("Resultado Líquido", (m) => m.resultadoLiquido);
    const csv = [cab, ...corpo].map((l) => l.join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `dre-gerencial-${ano}.csv`;
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
          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <Bloco titulo={`Demonstrativo ${ano}`} className="overflow-hidden">
              <div className="-mx-5 -mb-5 overflow-x-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="sticky left-0 z-10 bg-muted/50 px-4 py-2 text-left font-medium">
                        Linha
                      </th>
                      {mesesCurtos.map((m, i) => (
                        <th
                          key={m}
                          className={cn(
                            "px-3 py-2 text-right font-medium",
                            i === mes && "text-foreground",
                          )}
                        >
                          {m}
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
                      pick={(m) => m.receitaBruta}
                      grupo="receita_operacional"
                      linhas={linhas}
                      aberto={!!abertos["receita_operacional"]}
                      onToggle={() => alternar("receita_operacional")}
                    />
                    <LinhaTotal
                      nome="(-) Deduções"
                      resultados={resultados}
                      pick={(m) => -m.deducoes}
                      grupo="deducoes"
                      linhas={linhas}
                      aberto={!!abertos["deducoes"]}
                      onToggle={() => alternar("deducoes")}
                    />
                    <LinhaResumo
                      nome="= Receita Líquida"
                      resultados={resultados}
                      pick={(m) => m.receitaLiquida}
                    />
                    <LinhaTotal
                      nome="(-) Custos"
                      resultados={resultados}
                      pick={(m) => -m.custos}
                      grupo="custos"
                      linhas={linhas}
                      aberto={!!abertos["custos"]}
                      onToggle={() => alternar("custos")}
                    />
                    <LinhaResumo
                      nome="= Resultado Bruto"
                      resultados={resultados}
                      pick={(m) => m.resultadoBruto}
                    />
                    <LinhaTotal
                      nome="(-) Despesas"
                      resultados={resultados}
                      pick={(m) => -m.despesas}
                      grupo="despesas"
                      linhas={linhas}
                      aberto={!!abertos["despesas"]}
                      onToggle={() => alternar("despesas")}
                    />
                    <LinhaResumo
                      nome="= Resultado Operacional"
                      resultados={resultados}
                      pick={(m) => m.resultadoOperacional}
                      forte
                    />
                    <LinhaTotal
                      nome="(+/-) Resultado Financeiro"
                      resultados={resultados}
                      pick={(m) => m.financeiro}
                      grupo="financeiro"
                      linhas={linhas}
                      aberto={!!abertos["financeiro"]}
                      onToggle={() => alternar("financeiro")}
                    />
                    <LinhaResumo
                      nome="= Operacional + Financeiro"
                      resultados={resultados}
                      pick={(m) => m.resultadoOpFin}
                    />
                    <LinhaTotal
                      nome="(+/-) Não Operacional"
                      resultados={resultados}
                      pick={(m) => m.naoOperacional}
                      grupo="nao_operacional"
                      linhas={linhas}
                      aberto={!!abertos["nao_operacional"]}
                      onToggle={() => alternar("nao_operacional")}
                    />
                    <LinhaResumo
                      nome="= Resultado Líquido"
                      resultados={resultados}
                      pick={(m) => m.resultadoLiquido}
                      forte
                    />
                    <tr className="border-t bg-muted/30 text-xs text-muted-foreground">
                      <td className="sticky left-0 bg-muted/30 px-4 py-2">Margem operacional</td>
                      {resultados.map((m) => (
                        <td key={m.mes} className="tabular px-3 py-2 text-right">
                          {m.temMovimento ? pct(m.margemOperacional) : "—"}
                        </td>
                      ))}
                      <td className="px-3 py-2" />
                      <td className="tabular px-4 py-2 text-right">
                        {pct(mediaFechados(resultados, (m) => m.margemOperacional))}
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
                <ul className="space-y-2 text-sm">
                  {gruposOrdem.map((g) => {
                    const total = linhas
                      .filter((l) => l.grupo === g)
                      .reduce((s, l) => s + (l.valores[mes] ?? 0), 0);
                    return (
                      <li key={g} className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{grupoLabels[g]}</span>
                        <span className="tabular font-medium">{brl(total)}</span>
                      </li>
                    );
                  })}
                </ul>
              </Bloco>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function celaValor(v: number) {
  return v < 0 ? "text-negative" : v > 0 ? "text-foreground" : "text-muted-foreground";
}

function LinhaResumo({
  nome,
  resultados,
  pick,
  forte,
}: {
  nome: string;
  resultados: ResultadoMes[];
  pick: (m: ResultadoMes) => number;
  forte?: boolean;
}) {
  const vals = resultados.map(pick);
  const total = vals.reduce((s, v) => s + v, 0);
  return (
    <tr className={cn("border-b bg-secondary/60", forte && "bg-secondary font-semibold")}>
      <td className="sticky left-0 z-10 bg-secondary px-4 py-2 font-medium">{nome}</td>
      {vals.map((v, i) => (
        <td
          key={i}
          className={cn(
            "tabular px-3 py-2 text-right",
            v < 0 ? "text-negative" : v > 0 ? "text-positive" : "text-muted-foreground",
          )}
        >
          {resultados[i]?.temMovimento ? brl(v, true) : "—"}
        </td>
      ))}
      <td className="tabular px-3 py-2 text-right font-medium">{brl(total, true)}</td>
      <td className="tabular px-4 py-2 text-right">
        {brl(mediaFechados(resultados, pick), true)}
      </td>
    </tr>
  );
}

function LinhaTotal({
  nome,
  resultados,
  pick,
  grupo,
  linhas,
  aberto,
  onToggle,
}: {
  nome: string;
  resultados: ResultadoMes[];
  pick: (m: ResultadoMes) => number;
  grupo: GrupoDre;
  linhas: LinhaCategoria[];
  aberto: boolean;
  onToggle: () => void;
}) {
  const vals = resultados.map(pick);
  const total = vals.reduce((s, v) => s + v, 0);
  const filhos = linhas.filter((l) => l.grupo === grupo);
  const sinal = nome.startsWith("(-)") ? -1 : 1;

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
        {vals.map((v, i) => (
          <td key={i} className={cn("tabular px-3 py-2 text-right", celaValor(v))}>
            {resultados[i]?.temMovimento ? brl(v, true) : "—"}
          </td>
        ))}
        <td className="tabular px-3 py-2 text-right font-medium">{brl(total, true)}</td>
        <td className="tabular px-4 py-2 text-right">
          {brl(mediaFechados(resultados, pick), true)}
        </td>
      </tr>
      {aberto &&
        filhos.map((f) => {
          const somaFilho = f.valores.reduce((s, v) => s + v, 0) * sinal;
          const mesesComValor = f.valores.filter((v) => v !== 0).length || 1;
          return (
            <tr key={f.nome} className="border-b bg-muted/20 text-xs">
              <td className="sticky left-0 z-10 bg-muted/20 py-1.5 pl-11 pr-4">
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
              {f.valores.map((v, i) => (
                <td key={i} className="tabular px-3 py-1.5 text-right text-muted-foreground">
                  {v ? brl(v * sinal, true) : "—"}
                </td>
              ))}
              <td className="tabular px-3 py-1.5 text-right">{brl(somaFilho, true)}</td>
              <td className="tabular px-4 py-1.5 text-right text-muted-foreground">
                {brl(somaFilho / mesesComValor, true)}
              </td>
            </tr>
          );
        })}
    </>
  );
}
