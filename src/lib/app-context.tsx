import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CENTRO_CUSTO_TODOS, type CentroCustoFiltro } from "./centro-custo";
import type { PeriodoFiltro } from "./periodo";

interface AppState {
  empresaId: string | null;
  setEmpresaId: (id: string | null) => void;
  ano: number;
  setAno: (a: number) => void;
  mes: number;
  setMes: (m: number) => void;
  periodo: PeriodoFiltro;
  setPeriodo: (periodo: PeriodoFiltro) => void;
  centroCusto: CentroCustoFiltro;
  setCentroCusto: (centroCusto: CentroCustoFiltro) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const hoje = new Date();
  const [empresaId, setEmpresaIdState] = useState<string | null>(null);
  const [ano, setAnoState] = useState(hoje.getFullYear());
  const [mes, setMesState] = useState(hoje.getMonth());
  const [periodo, setPeriodoState] = useState<PeriodoFiltro>("mes_atual");
  const [centroCusto, setCentroCustoState] = useState<CentroCustoFiltro>([CENTRO_CUSTO_TODOS]);

  useEffect(() => {
    const e = localStorage.getItem("vg.empresa");
    const a = localStorage.getItem("vg.ano");
    const m = localStorage.getItem("vg.mes");
    const p = localStorage.getItem("vg.periodo") as PeriodoFiltro | null;
    const c = localStorage.getItem("vg.centroCusto");
    if (e) setEmpresaIdState(e);
    if (a) setAnoState(Number(a));
    if (m) setMesState(Number(m));
    if (p) setPeriodoState(p);
    if (c) setCentroCustoState(parseCentroCustoSalvo(c));
  }, []);

  const value = useMemo<AppState>(
    () => ({
      empresaId,
      setEmpresaId: (id) => {
        setEmpresaIdState(id);
        if (id) localStorage.setItem("vg.empresa", id);
        else localStorage.removeItem("vg.empresa");
      },
      ano,
      setAno: (a) => {
        setAnoState(a);
        localStorage.setItem("vg.ano", String(a));
      },
      mes,
      setMes: (m) => {
        setMesState(m);
        localStorage.setItem("vg.mes", String(m));
      },
      periodo,
      setPeriodo: (p) => {
        setPeriodoState(p);
        localStorage.setItem("vg.periodo", p);
      },
      centroCusto,
      setCentroCusto: (c) => {
        const proximo = c.length ? c : [CENTRO_CUSTO_TODOS];
        setCentroCustoState(proximo);
        localStorage.setItem("vg.centroCusto", JSON.stringify(proximo));
      },
    }),
    [empresaId, ano, mes, periodo, centroCusto],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp precisa estar dentro de AppProvider");
  return ctx;
}

function parseCentroCustoSalvo(valor: string): CentroCustoFiltro {
  try {
    const parsed = JSON.parse(valor);
    if (Array.isArray(parsed)) {
      const centros = parsed.filter((item): item is string => typeof item === "string" && !!item);
      return centros.length ? centros : [CENTRO_CUSTO_TODOS];
    }
  } catch {
    // Mantem compatibilidade com o valor antigo salvo como string simples.
  }

  return valor ? [valor] : [CENTRO_CUSTO_TODOS];
}
