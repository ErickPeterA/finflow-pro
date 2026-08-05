import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronDown,
  FolderKanban,
  LayoutDashboard,
  Upload,
  Table2,
  TrendingUp,
  Factory,
  Receipt,
  LineChart,
  Scale,
  ListChecks,
  FileText,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMeuCargo } from "@/lib/data";

const itemProjetos = {
  to: "/projetos",
  label: "Projetos",
  icon: FolderKanban,
} as const;

const itensProjeto = [
  itemProjetos,
  { to: "/home", label: "Home", icon: LayoutDashboard },
  { to: "/importacao", label: "Importação NIBO", icon: Upload },
  { to: "/dre", label: "DRE Gerencial", icon: Table2 },
  { to: "/receitas", label: "Receitas", icon: TrendingUp },
  { to: "/custos", label: "Custos", icon: Factory },
  { to: "/despesas", label: "Despesas", icon: Receipt },
  { to: "/analises", label: "Análises", icon: LineChart },
  { to: "/ponto-equilibrio", label: "Ponto de Equilíbrio", icon: Scale },
  { to: "/plano-acao", label: "Plano de Ação", icon: ListChecks },
  { to: "/relatorios", label: "Relatórios", icon: FileText },
] as const;

const itensEntrada = [
  { to: "/projetos", label: "Projetos", icon: FolderKanban },
] as const;

const itemGerenciamento = {
  to: "/gerenciamento",
  label: "Gerenciamento",
  icon: Menu,
} as const;

const subItensGerenciamento = [
  { label: "Criar login", aba: "criar-login" },
  { label: "Gerenciar usuários", aba: "gerenciar-usuarios" },
  { label: "Atrelar usuários", aba: "atrelar-usuarios" },
] as const;

export function AppSidebar({
  colapsado,
  onToggle,
}: {
  colapsado: boolean;
  onToggle: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const abaGerenciamento = useRouterState({
    select: (s) => String((s.location.search as { aba?: unknown }).aba ?? "criar-login"),
  });
  const { data: cargo } = useMeuCargo();
  const estaNoProjeto = pathname !== "/projetos" && pathname !== "/gerenciamento";
  const itensBase = estaNoProjeto ? itensProjeto : itensEntrada;
  const itensVisiveis = cargo === "admin" ? [...itensBase, itemGerenciamento] : itensBase;
  const gerenciamentoAberto = cargo === "admin" && pathname === "/gerenciamento";

  return (
    <aside
      className={cn(
        "sticky top-0 z-30 flex h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        colapsado ? "w-16" : "w-64",
      )}
    >
      <div className="flex h-16 items-center gap-3 px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
          VG
        </div>
        {!colapsado && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Ecossistema Financeiro</p>
            <p className="truncate text-xs text-sidebar-foreground/60">BPO Financeiro</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {itensVisiveis.map((item) => {
          const ativo = pathname === item.to || pathname.startsWith(item.to + "/");
          return (
            <div key={item.to}>
              <Link
                to={item.to}
                title={item.label}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  ativo
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-[inset_3px_0_0_0_var(--sidebar-primary)]"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                {!colapsado && (
                  <>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.to === "/gerenciamento" && (
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 transition-transform",
                          gerenciamentoAberto && "rotate-180",
                        )}
                      />
                    )}
                  </>
                )}
              </Link>

              {item.to === "/gerenciamento" && gerenciamentoAberto && !colapsado && (
                <div className="mt-1 space-y-1 border-l border-sidebar-border/70 pl-5">
                  {subItensGerenciamento.map((subItem) => {
                    const subAtivo = abaGerenciamento === subItem.aba;
                    return (
                      <Link
                        key={subItem.aba}
                        to="/gerenciamento"
                        search={{ aba: subItem.aba }}
                        className={cn(
                          "block rounded-md px-3 py-2 text-xs transition-colors",
                          subAtivo
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                        )}
                      >
                        {subItem.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <button
        onClick={onToggle}
        className="m-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60"
      >
        {colapsado ? (
          <PanelLeftOpen className="h-[18px] w-[18px]" />
        ) : (
          <>
            <PanelLeftClose className="h-[18px] w-[18px]" />
            <span>Recolher menu</span>
          </>
        )}
      </button>
    </aside>
  );
}
