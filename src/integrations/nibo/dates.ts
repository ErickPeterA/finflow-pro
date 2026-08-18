import type { PeriodoSync } from "./types";

const DIA_MS = 24 * 60 * 60 * 1000;

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(value: string): Date {
  const [ano, mes, dia] = value.split("-").map(Number);
  return new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1));
}

function addDays(value: string, days: number): string {
  return dateOnly(new Date(parseDateOnly(value).getTime() + days * DIA_MS));
}

export function calcularPeriodoSync(params: {
  hoje?: Date;
  lookbackDays: number;
  lastSuccessfulSyncAt: string | null;
  syncStartDate: string | null;
  initialSyncMaxDays: number;
}): PeriodoSync {
  const hoje = dateOnly(params.hoje ?? new Date());
  const lookback = Math.max(1, params.lookbackDays);

  if (params.lastSuccessfulSyncAt) {
    return {
      inicio: addDays(params.lastSuccessfulSyncAt.slice(0, 10), -lookback),
      fim: hoje,
    };
  }

  if (!params.syncStartDate) {
    throw new Error("Primeira sincronizacao NIBO exige sync_start_date configurado no projeto.");
  }

  const inicioComLookback = addDays(params.syncStartDate, -lookback);
  const limiteInicial = addDays(hoje, -Math.max(1, params.initialSyncMaxDays));

  return {
    inicio: inicioComLookback < limiteInicial ? limiteInicial : inicioComLookback,
    fim: hoje,
  };
}
