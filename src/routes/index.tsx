import { createFileRoute, redirect } from "@tanstack/react-router";
import { getLocalSession } from "@/lib/auth.functions";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ecossistema Financeiro BPO | VG" },
      {
        name: "description",
        content:
          "Plataforma de BPO financeiro: importação NIBO, DRE gerencial por regime de caixa, análises automáticas e relatórios do cliente.",
      },
      { property: "og:title", content: "Ecossistema Financeiro BPO | VG" },
      {
        property: "og:description",
        content:
          "Centralize importação, conferência, DRE gerencial, análises e relatórios dos clientes de BPO financeiro.",
      },
    ],
  }),
  beforeLoad: async () => {
    const { user } = await getLocalSession();
    throw redirect({ to: user ? "/projetos" : "/auth" });
  },
  component: Index,
});

function Index() {
  return null;
}
