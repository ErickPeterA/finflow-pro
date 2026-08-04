import { createFileRoute } from "@tanstack/react-router";
import { GrupoDetalhe } from "@/components/GrupoDetalhe";

export const Route = createFileRoute("/_authenticated/receitas")({
  head: () => ({
    meta: [
      { title: "Receitas | Ecossistema Financeiro BPO" },
      {
        name: "description",
        content:
          "Análise detalhada das receitas: evolução mensal, ranking por categoria e lançamentos do período.",
      },
      { property: "og:title", content: "Receitas | Ecossistema Financeiro BPO" },
      {
        property: "og:description",
        content: "Onde a receita está sendo gerada e como ela evolui mês a mês.",
      },
    ],
  }),
  component: () => (
    <GrupoDetalhe
      grupo="receita_operacional"
      titulo="Receitas"
      descricao="Entradas operacionais por regime de caixa"
    />
  ),
});
