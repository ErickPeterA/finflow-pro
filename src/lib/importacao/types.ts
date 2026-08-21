import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { LinhaImportada, TituloImportado } from "@/lib/nibo";

export type ClienteSupabaseFinanceiro = SupabaseClient<Database>;

export type OrigemImportacao = "manual" | "nibo_auto";

export interface MapeamentoImportacao {
  categoria_nibo: string;
  categoria_id: string | null;
}

export interface ImportarLinhasOptions {
  supabase: ClienteSupabaseFinanceiro;
  empresaId: string;
  linhas: LinhaImportada[];
  mapeamentos: MapeamentoImportacao[];
  arquivoNome: string;
  origem?: OrigemImportacao;
  ignorarDuplicados?: boolean;
  niboSyncRunId?: string;
  periodoInicio?: string;
  periodoFim?: string;
}

export interface ResultadoImportacaoFinanceira {
  inseridos: number;
  atualizados: number;
  ignorados: number;
}

export interface ImportarTitulosOptions {
  supabase: ClienteSupabaseFinanceiro;
  empresaId: string;
  titulos: TituloImportado[];
  arquivoNome: string;
  origem?: OrigemImportacao;
  ignorarDuplicados?: boolean;
  periodoInicio?: string;
  periodoFim?: string;
}
