import { createFileRoute } from "@tanstack/react-router";
import { GrupoDetalhe } from "@/components/GrupoDetalhe";

export const Route = createFileRoute("/_authenticated/despesas")({
  head: () => ({
    meta: [
      { title: "Despesas Operacionais | Ecossistema Financeiro BPO" },
      {
        name: "description",
        content:
          "Despesas da estrutura: evolução mensal, peso dos fixos e ranking das categorias que mais consomem resultado.",
      },
      { property: "og:title", content: "Despesas Operacionais | Ecossistema Financeiro BPO" },
      {
        property: "og:description",
        content: "Quanto custa manter a estrutura da empresa funcionando.",
      },
    ],
  }),
  component: () => (
    <GrupoDetalhe
      grupo="despesas"
      titulo="Despesas Operacionais"
      descricao="Estrutura administrativa, comercial e operacional indireta"
    />
  ),
});
