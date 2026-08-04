import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Printer } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Bloco, SemDados, SemEmpresa } from "@/components/ui-blocos";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/app-context";
import { useCategorias, useConfiguracao, useEmpresas, useLancamentos, usePlanosAcao } from "@/lib/data";
import { calcularDre, qualidadeResultado } from "@/lib/dre";
import { calcularImpactos, gerarAlertas } from "@/lib/insights";
import { brl, meses, pct } from "@/lib/format";

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

function RelatoriosPage() {
  const { empresaId, ano, mes } = useApp();
  const { data: empresas = [] } = useEmpresas();
  const { data: lancamentos = [] } = useLancamentos(empresaId, ano);
  const { data: categorias = [] } = useCategorias(empresaId);
  const { data: planos = [] } = usePlanosAcao(empresaId);
  const { data: config } = useConfiguracao(empresaId);

  const empresa = empresas.find((e) => e.id === empresaId);
  const resultados = useMemo(() => calcularDre(lancamentos, categorias), [lancamentos, categorias]);
  const atual = resultados[mes]!;
  const impactos = useMemo(
    () => calcularImpactos(lancamentos, categorias, mes),
    [lancamentos, categorias, mes],
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
  const qualidade = qualidadeResultado(atual, Number(config?.margem_desejada ?? 15));
  const acoesAbertas = planos.filter((p) => p.status !== "concluido" && p.status !== "cancelado");

  return (
    <>
      <TopBar
        titulo="Relatórios"
        descricao="Relatório mensal para apresentação ao cliente"
        acoes={
          <Button size="sm" variant="outline" onClick={() => window.print()} disabled={!empresaId}>
            <Printer className="mr-2 h-4 w-4" /> Imprimir / PDF
          </Button>
        }
      />
      <main className="space-y-5 p-6">
        {!empresaId ? (
          <SemEmpresa />
        ) : !atual.temMovimento ? (
          <SemDados mensagem="Sem lançamentos no período selecionado." />
        ) : (
          <article className="mx-auto max-w-3xl space-y-5">
            <Bloco titulo={`${empresa?.nome ?? ""} · ${meses[mes]} de ${ano}`}>
              <p className="text-sm text-muted-foreground">
                Relatório gerencial elaborado a partir dos lançamentos efetivamente liquidados no
                período (regime de caixa).
              </p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <Item rotulo="Receita do mês" valor={brl(atual.receitaBruta)} />
                <Item rotulo="Receita líquida" valor={brl(atual.receitaLiquida)} />
                <Item rotulo="Custos" valor={brl(atual.custos)} />
                <Item rotulo="Despesas" valor={brl(atual.despesas)} />
                <Item rotulo="Resultado operacional" valor={brl(atual.resultadoOperacional)} />
                <Item rotulo="Resultado líquido" valor={brl(atual.resultadoLiquido)} />
                <Item rotulo="Margem operacional" valor={pct(atual.margemOperacional)} />
                <Item rotulo="Qualidade do resultado" valor={qualidade.texto} />
              </dl>
            </Bloco>

            <Bloco titulo="Principais impactos do período">
              <ul className="space-y-2 text-sm">
                {[...impactos.positivos.slice(0, 3), ...impactos.negativos.slice(0, 3)].map((i) => (
                  <li key={i.nome} className="flex items-center justify-between gap-3 border-b pb-2">
                    <span>{i.nome}</span>
                    <span className="tabular font-medium">
                      {i.efeito > 0 ? "+" : ""}
                      {brl(i.efeito)}
                    </span>
                  </li>
                ))}
              </ul>
            </Bloco>

            <Bloco titulo="Leitura da consultoria">
              {alertas.length === 0 ? (
                <SemDados mensagem="Sem observações relevantes." />
              ) : (
                <ul className="space-y-3 text-sm">
                  {alertas.map((a) => (
                    <li key={a.titulo}>
                      <p className="font-medium">{a.titulo}</p>
                      <p className="text-muted-foreground">{a.detalhe}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Bloco>

            <Bloco titulo="Plano de ação em aberto">
              {acoesAbertas.length === 0 ? (
                <SemDados mensagem="Nenhuma ação em aberto." />
              ) : (
                <ol className="space-y-3 text-sm">
                  {acoesAbertas.map((p) => (
                    <li key={p.id} className="border-b pb-2">
                      <p className="font-medium">{p.acao}</p>
                      <p className="text-muted-foreground">{p.problema}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Bloco>
          </article>
        )}
      </main>
    </>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2 text-sm">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="tabular font-medium">{valor}</dd>
    </div>
  );
}
