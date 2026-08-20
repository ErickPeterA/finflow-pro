import { useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { CENTRO_CUSTO_TODOS, opcoesCentroCusto, type CentroCustoFiltro } from "@/lib/centro-custo";
import { useEmpresas, useLancamentos } from "@/lib/data";
import { meses } from "@/lib/format";
import { periodosFiltro, type PeriodoFiltro } from "@/lib/periodo";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function TopBar({
  titulo,
  descricao,
  acoes,
  mostrarContexto = true,
}: {
  titulo: string;
  descricao?: string;
  busca?: string;
  onBusca?: (v: string) => void;
  acoes?: ReactNode;
  mostrarContexto?: boolean;
}) {
  const {
    empresaId,
    setEmpresaId,
    ano,
    setAno,
    mes,
    setMes,
    periodo,
    setPeriodo,
    centroCusto,
    setCentroCusto,
  } = useApp();
  const { data: empresas = [] } = useEmpresas();
  const { data: lancamentos = [] } = useLancamentos(empresaId, ano);
  const centrosCusto = opcoesCentroCusto(lancamentos);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const anoAtual = new Date().getFullYear();
  const estaNoProjeto = pathname !== "/projetos" && pathname !== "/gerenciamento";

  useEffect(() => {
    if (
      centroCusto !== CENTRO_CUSTO_TODOS &&
      !centrosCusto.some((centro) => centro.value === centroCusto)
    ) {
      setCentroCusto(CENTRO_CUSTO_TODOS);
    }
  }, [centroCusto, centrosCusto, setCentroCusto]);

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function voltarParaProjetos() {
    setEmpresaId(null);
    navigate({ to: "/projetos" });
  }

  function selecionarCentroCusto(value: string) {
    setCentroCusto(value as CentroCustoFiltro);
  }

  function selecionarPeriodo(value: string) {
    setPeriodo(value as PeriodoFiltro);
  }

  return (
    <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3 px-6 py-3">
        <div className="mr-auto min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{titulo}</h1>
          {descricao && <p className="truncate text-xs text-muted-foreground">{descricao}</p>}
        </div>

        {mostrarContexto && (
          <>
            <Select value={empresaId ?? ""} onValueChange={(v) => setEmpresaId(v)}>
              <SelectTrigger className="h-9 w-52">
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={periodo} onValueChange={selecionarPeriodo}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                {periodosFiltro.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="h-9 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {meses.map((m, i) => (
                  <SelectItem key={m} value={String(i)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={centroCusto} onValueChange={selecionarCentroCusto}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CENTRO_CUSTO_TODOS}>Todos os centros</SelectItem>
                {centrosCusto.map((centro) => (
                  <SelectItem key={centro.value} value={centro.value}>
                    {centro.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="h-9 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[anoAtual + 1, anoAtual, anoAtual - 1, anoAtual - 2].map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        {acoes}

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={estaNoProjeto ? voltarParaProjetos : sair}
          title={estaNoProjeto ? "Voltar para Projetos" : "Sair"}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
