import { useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { useEmpresas } from "@/lib/data";
import { meses } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  busca,
  onBusca,
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
  const { empresaId, setEmpresaId, ano, setAno, mes, setMes } = useApp();
  const { data: empresas = [] } = useEmpresas();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const anoAtual = new Date().getFullYear();
  const estaNoProjeto = pathname !== "/projetos" && pathname !== "/gerenciamento";

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

  return (
    <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3 px-6 py-3">
        <div className="mr-auto min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{titulo}</h1>
          {descricao && <p className="truncate text-xs text-muted-foreground">{descricao}</p>}
        </div>

        {onBusca && (
          <div className="relative w-full max-w-56 md:w-56">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca ?? ""}
              onChange={(e) => onBusca(e.target.value)}
              placeholder="Buscar..."
              className="h-9 pl-8"
            />
          </div>
        )}

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
