import { createFileRoute } from "@tanstack/react-router";
import { GrupoDetalhe } from "@/components/GrupoDetalhe";

export const Route = createFileRoute("/_authenticated/custos")({
  head: () => ({
    meta: [
      { title: "Custos Operacionais | Ecossistema Financeiro BPO" },
      {
        name: "description",
        content: "Custos diretos da operação: evolução mensal e ranking por categoria.",
      },
      { property: "og:title", content: "Custos Operacionais | Ecossistema Financeiro BPO" },
      {
        property: "og:description",
        content: "Quanto custa entregar o que a empresa vende, mês a mês.",
      },
    ],
  }),
  component: () => (
    <GrupoDetalhe
      grupo="custos"
      titulo="Custos Operacionais"
      descricao="Custos diretamente ligados à entrega do produto ou serviço"
    />
  ),
});
