import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

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
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/projetos" : "/auth" });
  },
  component: Index,
});

function Index() {
  return null;
}
