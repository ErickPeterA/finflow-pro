import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CENTRO_CUSTO_TODOS, type CentroCustoFiltro } from "./centro-custo";
import { mesesDoPeriodoFiltro, type PeriodoFiltro } from "./periodo";

interface AppState {
  empresaId: string | null;
  setEmpresaId: (id: string | null) => void;
  ano: number;
  setAno: (a: number) => void;
  mes: number;
  setMes: (m: number) => void;
  mesesSelecionados: number[];
  setMesesSelecionados: (meses: number[]) => void;
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
  const [mesesSelecionados, setMesesSelecionadosState] = useState<number[]>([hoje.getMonth()]);
  const [periodo, setPeriodoState] = useState<PeriodoFiltro>("mes_atual");
  const [centroCusto, setCentroCustoState] = useState<CentroCustoFiltro>([CENTRO_CUSTO_TODOS]);

  useEffect(() => {
    const e = localStorage.getItem("vg.empresa");
    const a = localStorage.getItem("vg.ano");
    const m = localStorage.getItem("vg.mes");
    const ms = localStorage.getItem("vg.meses");
    const p = localStorage.getItem("vg.periodo") as PeriodoFiltro | null;
    const c = localStorage.getItem("vg.centroCusto");
    if (e) setEmpresaIdState(e);
    if (a) setAnoState(Number(a));
    const mesSalvo = m ? Number(m) : new Date().getMonth();
    if (m) setMesState(mesSalvo);
    if (p && p !== "mes_atual") {
      setMesesSelecionadosState(mesesDoPeriodoFiltro(p, mesSalvo));
    } else if (ms) {
      setMesesSelecionadosState(parseMesesSalvos(ms, mesSalvo));
    } else if (m) {
      setMesesSelecionadosState([mesSalvo]);
    }
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
        setMesesSelecionadosState([m]);
        localStorage.setItem("vg.mes", String(m));
        localStorage.setItem("vg.meses", JSON.stringify([m]));
      },
      mesesSelecionados,
      setMesesSelecionados: (meses) => {
        const proximos = normalizarMeses(meses, mes);
        setMesesSelecionadosState(proximos);
        setMesState(proximos.at(-1) ?? mes);
        localStorage.setItem("vg.meses", JSON.stringify(proximos));
        localStorage.setItem("vg.mes", String(proximos.at(-1) ?? mes));
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
    [empresaId, ano, mes, mesesSelecionados, periodo, centroCusto],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function normalizarMeses(valores: number[], fallback: number): number[] {
  const meses = [...new Set(valores)]
    .filter((valor) => Number.isInteger(valor) && valor >= 0 && valor <= 11)
    .sort((a, b) => a - b);
  return meses.length ? meses : [fallback];
}

function parseMesesSalvos(valor: string, fallback: number): number[] {
  try {
    const parsed = JSON.parse(valor);
    if (Array.isArray(parsed)) return normalizarMeses(parsed, fallback);
  } catch {
    // Ignora preferências inválidas e preserva o mês de referência.
  }
  return [fallback];
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
