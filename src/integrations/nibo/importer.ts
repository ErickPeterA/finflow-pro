import { createHash } from "node:crypto";
import type { LinhaImportada } from "../../lib/nibo";
import { NiboSyncError } from "./errors";
import type { NiboProjectConfig, TipoRelatorioNibo } from "./types";

export interface LinhaNiboSincronizavel extends LinhaImportada {
  external_id?: string;
  source_content_hash?: string;
}

function normalizar(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function valorPorTipo(valor: number, tipo: TipoRelatorioNibo) {
  const absoluto = Math.abs(valor);
  return tipo === "paga" ? -absoluto : absoluto;
}

export function prepararLinhasParaSyncNibo(
  linhas: LinhaImportada[],
  contexto: { config: NiboProjectConfig; tipo: TipoRelatorioNibo },
): LinhaNiboSincronizavel[] {
  const ocorrenciasPorBase = new Map<string, number>();

  return linhas.map((linha) => {
    const niboId = linha.nibo_id?.trim();
    if (!niboId) {
      return { ...linha, tipo: contexto.tipo, valor: valorPorTipo(linha.valor, contexto.tipo) };
    }

    const valor = valorPorTipo(linha.valor, contexto.tipo);
    const baseExternalId = [
      contexto.config.nibo_company_id,
      contexto.tipo,
      normalizar(niboId),
      normalizar(linha.categoria_nibo),
      normalizar(linha.centro_custo),
    ].join("|");
    const ocorrencia = ocorrenciasPorBase.get(baseExternalId) ?? 0;
    ocorrenciasPorBase.set(baseExternalId, ocorrencia + 1);

    const externalId =
      ocorrencia === 0
        ? baseExternalId
        : `${baseExternalId}|${ocorrencia + 1}|${sha256([
            linha.data_efetiva,
            linha.descricao,
            linha.pessoa,
            valor.toFixed(2),
          ]).slice(0, 12)}`;

    const sourceContentHash = sha256({
      niboId,
      tipo: contexto.tipo,
      data_efetiva: linha.data_efetiva,
      competencia: linha.competencia,
      descricao: linha.descricao,
      categoria_nibo: linha.categoria_nibo,
      pessoa: linha.pessoa,
      centro_custo: linha.centro_custo,
      conta_bancaria: linha.conta_bancaria,
      valor,
    });

    return {
      ...linha,
      tipo: contexto.tipo,
      valor,
      hash: `nibo:${externalId}`,
      external_source: "nibo",
      external_id: externalId,
      source_content_hash: sourceContentHash,
    };
  });
}

export function garantirIdentificadoresExternos(linhas: LinhaNiboSincronizavel[]) {
  const semIdentificador = linhas.filter((linha) => !linha.external_id?.trim()).length;
  if (semIdentificador > 0) {
    throw new NiboSyncError(
      `Exportacao NIBO sem identificador unico confirmado em ${semIdentificador} linha(s). Importacao abortada.`,
      "NIBO_EXTERNAL_ID_MISSING",
    );
  }
}
