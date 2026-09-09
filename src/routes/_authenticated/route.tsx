import {
  createFileRoute,
  redirect,
  Outlet,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getLocalSession } from "@/lib/auth.functions";
import { AppProvider, useApp } from "@/lib/app-context";
import { AppSidebar } from "@/components/AppSidebar";
import { useMeuCargo, usePerfilProjetoAtual } from "@/lib/data";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { user } = await getLocalSession();
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: Layout,
  errorComponent: LayoutErro,
});

const rotasRestritasUsuarioExterno = [
  "/importacao",
  "/ponto-equilibrio",
  "/auditoria-financeira",
  "/relatorios",
];

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
      <LayoutAutenticado colapsado={colapsado} onToggle={() => setColapsado((c) => !c)} />
    </AppProvider>
  );
}

function LayoutAutenticado({ colapsado, onToggle }: { colapsado: boolean; onToggle: () => void }) {
  const { empresaId } = useApp();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: cargo } = useMeuCargo();
  const { data: perfilProjeto } = usePerfilProjetoAtual(empresaId);
  const usuarioExterno = cargo !== "admin" && perfilProjeto === "externo";
  const rotaRestrita = rotasRestritasUsuarioExterno.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`),
  );
  const acessoBloqueado = usuarioExterno && rotaRestrita;

  useEffect(() => {
    if (acessoBloqueado) {
      navigate({ to: "/home", replace: true });
    }
  }, [acessoBloqueado, navigate]);

  return (
    <div className="flex min-h-screen w-full bg-sidebar">
      <AppSidebar colapsado={colapsado} onToggle={onToggle} />
      <div className="w-3 shrink-0 bg-sidebar shadow-[inset_-1px_0_0_rgba(255,255,255,0.22)]" />
      <div className="flex min-w-0 flex-1 flex-col bg-[linear-gradient(180deg,#08245a_0%,#0f3f86_42%,#0f3f86_100%)]">
        {acessoBloqueado ? null : <Outlet />}
      </div>
    </div>
  );
}
