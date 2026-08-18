import type { ResultadoParse } from "../../lib/nibo";
import { NiboSyncError } from "./errors";
import type { TipoRelatorioNibo } from "./types";

export function validarArquivoExportadoNibo(
  resultado: ResultadoParse,
  contexto: { tipo: TipoRelatorioNibo; periodoInicio: string; periodoFim: string },
) {
  if (resultado.erros.length) {
    throw new NiboSyncError(resultado.erros.join(" | "), "NIBO_PARSE_ERROR");
  }

  if (!resultado.linhas.length) {
    throw new NiboSyncError(
      `Relatorio NIBO vazio para ${contexto.tipo} entre ${contexto.periodoInicio} e ${contexto.periodoFim}.`,
      "NIBO_EMPTY_EXPORT",
    );
  }

  const tiposDivergentes = resultado.linhas.filter((linha) => linha.tipo !== contexto.tipo).length;
  if (tiposDivergentes > 0) {
    throw new NiboSyncError(
      `Relatorio NIBO contem ${tiposDivergentes} linha(s) de tipo diferente de ${contexto.tipo}.`,
      "NIBO_REPORT_TYPE_MISMATCH",
    );
  }
}
