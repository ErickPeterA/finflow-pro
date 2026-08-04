import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface AppState {
  empresaId: string | null;
  setEmpresaId: (id: string | null) => void;
  ano: number;
  setAno: (a: number) => void;
  mes: number;
  setMes: (m: number) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const hoje = new Date();
  const [empresaId, setEmpresaIdState] = useState<string | null>(null);
  const [ano, setAnoState] = useState(hoje.getFullYear());
  const [mes, setMesState] = useState(hoje.getMonth());

  useEffect(() => {
    const e = localStorage.getItem("vg.empresa");
    const a = localStorage.getItem("vg.ano");
    const m = localStorage.getItem("vg.mes");
    if (e) setEmpresaIdState(e);
    if (a) setAnoState(Number(a));
    if (m) setMesState(Number(m));
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
    }),
    [empresaId, ano, mes],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp precisa estar dentro de AppProvider");
  return ctx;
}
