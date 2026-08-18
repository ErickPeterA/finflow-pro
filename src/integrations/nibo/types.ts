import type { Database } from "../supabase/types";

export type TipoRelatorioNibo = Database["public"]["Enums"]["tipo_lancamento"];

export interface NiboProjectConfig {
  empresa_id: string;
  empresa_nome: string;
  nibo_company_id: string;
  nibo_company_name: string;
  sync_start_date: string | null;
  lookback_days: number;
}

export interface PeriodoSync {
  inicio: string;
  fim: string;
}

export interface NiboExportRequest {
  config: NiboProjectConfig;
  tipo: TipoRelatorioNibo;
  periodo: PeriodoSync;
}

export interface NiboExportResult {
  filePath: string;
  reportName: string;
}

export interface NiboSyncResumo {
  projetosTotal: number;
  projetosSucesso: number;
  projetosFalha: number;
  pagasSucesso: number;
  pagasFalha: number;
  recebidasSucesso: number;
  recebidasFalha: number;
}
