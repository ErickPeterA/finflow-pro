import { createFileRoute, redirect, Outlet, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppProvider } from "@/lib/app-context";
import { AppSidebar } from "@/components/AppSidebar";

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
        <Link to="/projetos" className="mt-4 inline-block text-sm text-info underline">
          Voltar para Projetos
        </Link>
      </div>
    </div>
  );
}

function Layout() {
  const [colapsado, setColapsado] = useState(false);

  return (
    <AppProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar colapsado={colapsado} onToggle={() => setColapsado((c) => !c)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    </AppProvider>
  );
}
