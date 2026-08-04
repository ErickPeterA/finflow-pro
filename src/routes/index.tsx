import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
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
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      navigate({ to: data.session ? "/projetos" : "/auth", replace: true });
    });
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-deep text-navy-foreground">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
          VG
        </div>
        <h1 className="mt-4 text-lg font-semibold">Ecossistema Financeiro BPO</h1>
        <p className="mt-1 text-sm text-navy-foreground/60">Carregando sua área...</p>
      </div>
    </main>
  );
}
