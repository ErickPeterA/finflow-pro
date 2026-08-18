import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import { getNiboRuntimeConfig } from "./config";
import { calcularPeriodoSync } from "./dates";
import { exportNiboReport } from "./exports";
import { ensureNiboAuthenticated } from "./auth";
import { openNiboBrowser, type NiboBrowserSession } from "./browser";
import { importarLinhasFinanceiras } from "../../lib/importacao/importer";
import type { MapeamentoImportacao } from "../../lib/importacao/types";
import { garantirIdentificadoresExternos, prepararLinhasParaSyncNibo } from "./importer";
import { erroParaTexto, logError, logInfo } from "./logger";
import { parseNiboExportFile } from "./parser";
import type { NiboProjectConfig, NiboSyncResumo, TipoRelatorioNibo } from "./types";
import { validarArquivoExportadoNibo } from "./validator";

type SyncClient = SupabaseClient<Database>;

const TIPOS: TipoRelatorioNibo[] = ["paga", "recebida"];

type ConfigRow = {
  empresa_id: string;
  nibo_company_id: string;
  nibo_company_name: string;
  sync_start_date: string | null;
  lookback_days: number | null;
  empresas?:
    | { nome?: string | null; ativo?: boolean | null }
    | Array<{ nome?: string | null; ativo?: boolean | null }>;
};

function empresaDaConfig(row: ConfigRow) {
  return Array.isArray(row.empresas) ? row.empresas[0] : row.empresas;
}

function mapConfig(row: ConfigRow, defaultLookbackDays: number): NiboProjectConfig | null {
  const empresa = empresaDaConfig(row);
  if (empresa?.ativo === false) return null;

  return {
    empresa_id: row.empresa_id,
    empresa_nome: empresa?.nome || row.nibo_company_name || row.empresa_id,
    nibo_company_id: row.nibo_company_id,
    nibo_company_name: row.nibo_company_name,
    sync_start_date: row.sync_start_date,
    lookback_days: row.lookback_days || defaultLookbackDays,
  };
}

async function listarProjetosHabilitados(
  supabase: SyncClient,
  defaultLookbackDays: number,
): Promise<NiboProjectConfig[]> {
  const { data, error } = await supabase
    .from("nibo_project_configs")
    .select(
      "empresa_id,nibo_company_id,nibo_company_name,sync_start_date,lookback_days,empresas!inner(nome,ativo)",
    )
    .eq("nibo_enabled", true)
    .eq("auto_sync_enabled", true)
    .order("nibo_company_name");

  if (error) throw error;

  return ((data ?? []) as unknown as ConfigRow[])
    .map((row) => mapConfig(row, defaultLookbackDays))
    .filter((config): config is NiboProjectConfig => Boolean(config));
}

async function criarRun(supabase: SyncClient, triggerSource: "manual" | "scheduled" | "test") {
  const { data, error } = await supabase
    .from("nibo_sync_runs")
    .insert({ trigger_source: triggerSource, status: "running" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function finalizarRun(supabase: SyncClient, runId: string, resumo: NiboSyncResumo) {
  const status =
    resumo.projetosFalha === 0
      ? "success"
      : resumo.projetosSucesso > 0
        ? "partial_success"
        : "failed";

  const { error } = await supabase
    .from("nibo_sync_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      projects_total: resumo.projetosTotal,
      projects_success: resumo.projetosSucesso,
      projects_failed: resumo.projetosFalha,
      pagas_success: resumo.pagasSucesso,
      pagas_failed: resumo.pagasFalha,
      recebidas_success: resumo.recebidasSucesso,
      recebidas_failed: resumo.recebidasFalha,
      summary: { ...resumo },
    })
    .eq("id", runId);
  if (error) throw error;
}

async function obterUltimoSucesso(
  supabase: SyncClient,
  empresaId: string,
  tipo: TipoRelatorioNibo,
) {
  const { data, error } = await supabase
    .from("nibo_sync_states")
    .select("last_successful_sync_at")
    .eq("empresa_id", empresaId)
    .eq("tipo", tipo)
    .maybeSingle();
  if (error) throw error;
  return data?.last_successful_sync_at ?? null;
}

async function listarMapeamentosEmpresa(
  supabase: SyncClient,
  empresaId: string,
): Promise<MapeamentoImportacao[]> {
  const { data, error } = await supabase
    .from("mapeamentos")
    .select("categoria_nibo,categoria_id")
    .eq("empresa_id", empresaId);
  if (error) throw error;
  return data ?? [];
}

async function criarItem(
  supabase: SyncClient,
  runId: string,
  config: NiboProjectConfig,
  tipo: TipoRelatorioNibo,
  periodo: { inicio: string; fim: string },
) {
  const { data, error } = await supabase
    .from("nibo_sync_items")
    .insert({
      run_id: runId,
      empresa_id: config.empresa_id,
      tipo,
      nibo_company_id: config.nibo_company_id,
      nibo_company_name: config.nibo_company_name,
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      status: "running",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function atualizarEstadoFalha(
  supabase: SyncClient,
  itemId: string,
  config: NiboProjectConfig,
  tipo: TipoRelatorioNibo,
  erro: string,
) {
  await supabase
    .from("nibo_sync_items")
    .update({ status: "failed", finished_at: new Date().toISOString(), error_message: erro })
    .eq("id", itemId);

  await supabase.from("nibo_sync_states").upsert(
    {
      empresa_id: config.empresa_id,
      tipo,
      last_attempt_at: new Date().toISOString(),
      status: "failed",
      last_error: erro,
      last_run_item_id: itemId,
    },
    { onConflict: "empresa_id,tipo" },
  );
}

async function atualizarEstadoSucesso(
  supabase: SyncClient,
  itemId: string,
  config: NiboProjectConfig,
  tipo: TipoRelatorioNibo,
  periodo: { inicio: string; fim: string },
  resultado: { encontrados: number; inseridos: number; atualizados: number; ignorados: number },
) {
  await supabase
    .from("nibo_sync_items")
    .update({
      status: "success",
      finished_at: new Date().toISOString(),
      registros_encontrados: resultado.encontrados,
      registros_inseridos: resultado.inseridos,
      registros_atualizados: resultado.atualizados,
      registros_ignorados: resultado.ignorados,
    })
    .eq("id", itemId);

  await supabase.from("nibo_sync_states").upsert(
    {
      empresa_id: config.empresa_id,
      tipo,
      last_attempt_at: new Date().toISOString(),
      last_successful_sync_at: new Date().toISOString(),
      last_period_start: periodo.inicio,
      last_period_end: periodo.fim,
      status: "success",
      last_error: null,
      last_run_item_id: itemId,
    },
    { onConflict: "empresa_id,tipo" },
  );
}

function contarProjetoComFalha(falhas: Record<string, boolean>, empresaId: string) {
  falhas[empresaId] = true;
}

export async function runNiboSync(
  supabase: SyncClient,
  triggerSource: "manual" | "scheduled" | "test",
) {
  const runtime = getNiboRuntimeConfig();
  const projetos = await listarProjetosHabilitados(supabase, runtime.defaultLookbackDays);
  const runId = await criarRun(supabase, triggerSource);
  const projetosComFalha: Record<string, boolean> = {};
  let browser: NiboBrowserSession | null = null;

  const resumo: NiboSyncResumo = {
    projetosTotal: projetos.length,
    projetosSucesso: 0,
    projetosFalha: 0,
    pagasSucesso: 0,
    pagasFalha: 0,
    recebidasSucesso: 0,
    recebidasFalha: 0,
  };

  logInfo("nibo_sync_started", { runId, projetos: projetos.length, dryRun: runtime.dryRun });

  try {
    if (!runtime.dryRun) {
      browser = await openNiboBrowser(runtime);
      await ensureNiboAuthenticated(browser.page, runtime);
    }

    for (const config of projetos) {
      let projetoOk = true;

      for (const tipo of TIPOS) {
        let itemId: string | null = null;
        try {
          const lastSuccessfulSyncAt = await obterUltimoSucesso(supabase, config.empresa_id, tipo);
          const periodo = calcularPeriodoSync({
            lookbackDays: config.lookback_days,
            lastSuccessfulSyncAt,
            syncStartDate: config.sync_start_date,
            initialSyncMaxDays: runtime.initialSyncMaxDays,
          });

          itemId = await criarItem(supabase, runId, config, tipo, periodo);

          if (runtime.dryRun) {
            await supabase
              .from("nibo_sync_items")
              .update({ status: "skipped", finished_at: new Date().toISOString() })
              .eq("id", itemId);
            logInfo("nibo_sync_dry_run_item", {
              runId,
              empresaId: config.empresa_id,
              tipo,
              periodo,
            });
            continue;
          }

          if (!browser) throw new Error("Browser NIBO nao inicializado.");
          const exportado = await exportNiboReport(browser.page, { config, tipo, periodo });
          const resultadoParse = await parseNiboExportFile(exportado.filePath, periodo.fim);
          const linhasPreparadas = prepararLinhasParaSyncNibo(resultadoParse.linhas, {
            config,
            tipo,
          });
          const resultadoPreparado = { ...resultadoParse, linhas: linhasPreparadas };
          validarArquivoExportadoNibo(resultadoPreparado, {
            tipo,
            periodoInicio: periodo.inicio,
            periodoFim: periodo.fim,
          });
          garantirIdentificadoresExternos(linhasPreparadas);

          const mapeamentos = await listarMapeamentosEmpresa(supabase, config.empresa_id);
          const resultadoImportacao = await importarLinhasFinanceiras({
            supabase,
            empresaId: config.empresa_id,
            linhas: linhasPreparadas,
            mapeamentos,
            arquivoNome: exportado.filePath,
            origem: "nibo_auto",
            ignorarDuplicados: false,
            niboSyncRunId: runId,
            periodoInicio: periodo.inicio,
            periodoFim: periodo.fim,
          });

          logInfo("nibo_sync_item_imported", {
            runId,
            empresaId: config.empresa_id,
            tipo,
            arquivo: exportado.filePath,
            encontrados: linhasPreparadas.length,
            inseridos: resultadoImportacao.inseridos,
            atualizados: resultadoImportacao.atualizados,
            ignorados: resultadoImportacao.ignorados,
          });

          await atualizarEstadoSucesso(supabase, itemId, config, tipo, periodo, {
            encontrados: linhasPreparadas.length,
            ...resultadoImportacao,
          });

          if (tipo === "paga") resumo.pagasSucesso += 1;
          else resumo.recebidasSucesso += 1;
        } catch (error) {
          projetoOk = false;
          contarProjetoComFalha(projetosComFalha, config.empresa_id);
          const erro = erroParaTexto(error);
          if (itemId) await atualizarEstadoFalha(supabase, itemId, config, tipo, erro);
          if (tipo === "paga") resumo.pagasFalha += 1;
          else resumo.recebidasFalha += 1;
          logError("nibo_sync_item_failed", {
            runId,
            empresaId: config.empresa_id,
            tipo,
            erro,
          });
        }
      }

      if (projetoOk) resumo.projetosSucesso += 1;
    }
  } finally {
    if (browser) await browser.close();
  }

  resumo.projetosFalha = Object.keys(projetosComFalha).length;
  await finalizarRun(supabase, runId, resumo);
  logInfo("nibo_sync_finished", { runId, ...resumo });

  return { runId, resumo };
}
