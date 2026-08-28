import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Check, ChevronsUpDown, LogOut } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { CENTRO_CUSTO_TODOS, opcoesCentroCusto } from "@/lib/centro-custo";
import { useEmpresas, useLancamentos } from "@/lib/data";
import { meses } from "@/lib/format";
import { periodosFiltro, type PeriodoFiltro } from "@/lib/periodo";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

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
  const todosCentrosSelecionados = centroCusto.includes(CENTRO_CUSTO_TODOS);
  const centrosSelecionados = todosCentrosSelecionados
    ? []
    : centrosCusto.filter((centro) => centroCusto.includes(centro.value));
  const centroCustoLabel = todosCentrosSelecionados
    ? "Todos os centros"
    : centrosSelecionados.length === 1
      ? centrosSelecionados[0]?.label
      : `${centrosSelecionados.length} centros selecionados`;

  useEffect(() => {
    const opcoesValidas = new Set(centrosCusto.map((centro) => centro.value));
    const centrosValidos = centroCusto.filter(
      (centro) => centro === CENTRO_CUSTO_TODOS || opcoesValidas.has(centro),
    );

    if (centrosValidos.length !== centroCusto.length) {
      setCentroCusto(centrosValidos.length ? centrosValidos : [CENTRO_CUSTO_TODOS]);
      return;
    }

    if (centroCusto.includes(CENTRO_CUSTO_TODOS) && centroCusto.length > 1) {
      setCentroCusto([CENTRO_CUSTO_TODOS]);
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
    if (value === CENTRO_CUSTO_TODOS) {
      setCentroCusto([CENTRO_CUSTO_TODOS]);
      return;
    }

    const atuais = centroCusto.filter((centro) => centro !== CENTRO_CUSTO_TODOS);
    const proximo = atuais.includes(value)
      ? atuais.filter((centro) => centro !== value)
      : [...atuais, value];
    setCentroCusto(proximo.length ? proximo : [CENTRO_CUSTO_TODOS]);
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

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  className="h-9 w-56 justify-between"
                >
                  <span className="truncate">{centroCustoLabel}</span>
                  <ChevronsUpDown className="h-4 w-4 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-0">
                <Command>
                  <CommandInput placeholder="Buscar centro..." />
                  <CommandList>
                    <CommandEmpty>Nenhum centro encontrado.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="Todos os centros"
                        onSelect={() => selecionarCentroCusto(CENTRO_CUSTO_TODOS)}
                      >
                        <span className="min-w-0 flex-1 truncate">Todos os centros</span>
                        <Check
                          className={cn(
                            "h-4 w-4",
                            todosCentrosSelecionados ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </CommandItem>
                      {centrosCusto.map((centro) => {
                        const selecionado = centroCusto.includes(centro.value);

                        return (
                          <CommandItem
                            key={centro.value}
                            value={centro.label}
                            onSelect={() => selecionarCentroCusto(centro.value)}
                          >
                            <span className="min-w-0 flex-1 truncate">{centro.label}</span>
                            <Check
                              className={cn("h-4 w-4", selecionado ? "opacity-100" : "opacity-0")}
                            />
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

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
