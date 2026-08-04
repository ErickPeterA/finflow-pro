import { createFileRoute } from "@tanstack/react-router";
import { GrupoDetalhe } from "@/components/GrupoDetalhe";

export const Route = createFileRoute("/_authenticated/custos")({
  head: () => ({
    meta: [
      { title: "Custos | Ecossistema Financeiro BPO" },
      {
        name: "description",
        content:
          "Custos diretos da operação: evolução, composição fixo x variável e ranking por categoria.",
      },
      { property: "og:title", content: "Custos | Ecossistema Financeiro BPO" },
      {
        property: "og:description",
        content: "Quanto custa entregar o que a empresa vende, mês a mês.",
      },
    ],
  }),
  component: () => (
    <GrupoDetalhe
      grupo="custos"
      titulo="Custos"
      descricao="Custos diretamente ligados à entrega do produto ou serviço"
    />
  ),
});
