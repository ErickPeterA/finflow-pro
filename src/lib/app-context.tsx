import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CENTRO_CUSTO_TODOS, type CentroCustoFiltro } from "./centro-custo";

interface AppState {
  empresaId: string | null;
  setEmpresaId: (id: string | null) => void;
  ano: number;
  setAno: (a: number) => void;
  mes: number;
  setMes: (m: number) => void;
  centroCusto: CentroCustoFiltro;
  setCentroCusto: (centroCusto: CentroCustoFiltro) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const hoje = new Date();
  const [empresaId, setEmpresaIdState] = useState<string | null>(null);
  const [ano, setAnoState] = useState(hoje.getFullYear());
  const [mes, setMesState] = useState(hoje.getMonth());
  const [centroCusto, setCentroCustoState] = useState<CentroCustoFiltro>(CENTRO_CUSTO_TODOS);

  useEffect(() => {
    const e = localStorage.getItem("vg.empresa");
    const a = localStorage.getItem("vg.ano");
    const m = localStorage.getItem("vg.mes");
    const c = localStorage.getItem("vg.centroCusto");
    if (e) setEmpresaIdState(e);
    if (a) setAnoState(Number(a));
    if (m) setMesState(Number(m));
    if (c) setCentroCustoState(c);
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
      centroCusto,
      setCentroCusto: (c) => {
        setCentroCustoState(c);
        localStorage.setItem("vg.centroCusto", c);
      },
    }),
    [empresaId, ano, mes, centroCusto],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp precisa estar dentro de AppProvider");
  return ctx;
}
