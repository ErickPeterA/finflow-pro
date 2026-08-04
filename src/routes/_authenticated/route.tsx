import { createFileRoute, redirect, Outlet, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppProvider, useApp } from "@/lib/app-context";
import { AppSidebar } from "@/components/AppSidebar";
import { useEmpresas } from "@/lib/data";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
  errorComponent: LayoutErro,
});

function LayoutErro({ error }: { error: Error }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-8 text-center">
      <div>
        <h1 className="text-lg font-semibold">Não foi possível carregar</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{error.message}</p>
        <Link to="/home" className="mt-4 inline-block text-sm text-info underline">
          Voltar para a Home
        </Link>
      </div>
    </div>
  );
}

function AutoSelecionarEmpresa() {
  const { empresaId, setEmpresaId } = useApp();
  const { data: empresas } = useEmpresas();
  useEffect(() => {
    if (!empresaId && empresas && empresas.length > 0) {
      setEmpresaId(empresas[0]!.id);
    }
  }, [empresaId, empresas, setEmpresaId]);
  return null;
}

function Layout() {
  const [colapsado, setColapsado] = useState(false);

  return (
    <AppProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar colapsado={colapsado} onToggle={() => setColapsado((c) => !c)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AutoSelecionarEmpresa />
          <Outlet />
        </div>
      </div>
    </AppProvider>
  );
}
