import * as XLSX from "xlsx";

export type TipoLancamento = "recebida" | "paga";

export interface LinhaImportada {
  tipo: TipoLancamento;
  data_efetiva: string;
  competencia: string;
  descricao: string;
  categoria_nibo: string;
  pessoa: string;
  centro_custo: string;
  conta_bancaria: string;
  valor: number;
  hash: string;
  nibo_id?: string;
  external_id?: string;
  external_source?: string;
  source_content_hash?: string;
}

export interface ResultadoParse {
  linhas: LinhaImportada[];
  colunas: string[];
  erros: string[];
  avisos: string[];
}

type ChaveColuna =
  "data" | "valor" | "descricao" | "categoria" | "codigo" | "pessoa" | "centro" | "banco";

type LinhaCandidata = Omit<LinhaImportada, "tipo" | "valor" | "hash"> & {
  valorAssinado: number;
  tipoContexto: TipoLancamento;
  codigo_nibo: string;
  origem: string;
};

const ALIASES: Record<ChaveColuna, string[]> = {
  data: [
    "data de pagamento",
    "data do pagamento",
    "data de recebimento",
    "data do recebimento",
    "data de liquidacao",
    "data de liquidação",
    "data pagamento",
    "data recebimento",
    "data efetiva",
    "data",
    "vencimento",
  ],
  valor: [
    "valor pago",
    "valor recebido",
    "valor de categoria",
    "valor da categoria",
    "valor categoria",
    "valor do lancamento",
    "valor do lançamento",
    "valor liquido",
    "valor líquido",
    "valor total",
    "valor",
    "total",
    "entrada",
    "saida",
    "saída",
    "credito",
    "crédito",
    "debito",
    "débito",
  ],
  descricao: [
    "descricao",
    "descrição",
    "historico",
    "histórico",
    "observacao",
    "observação",
    "memo",
  ],
  categoria: [
    "categoria",
    "categoria nibo",
    "plano de contas",
    "conta",
    "classificacao",
    "classificação",
    "topico",
    "tópico",
  ],
  codigo: [
    "codigo",
    "código",
    "codigo nibo",
    "código nibo",
    "codigo da categoria",
    "código da categoria",
    "codigo do topico",
    "código do tópico",
    "topico",
    "tópico",
  ],
  pessoa: [
    "cliente",
    "fornecedor",
    "pessoa",
    "nome",
    "cliente/fornecedor",
    "favorecido",
    "pagador",
  ],
  centro: ["centro de custo", "centro custo", "centro de resultado", "departamento"],
  banco: ["conta bancaria", "conta bancária", "banco", "conta corrente", "conta financeira"],
};

const TERMOS_PAGA = [
  "contas a pagar",
  "contas pagas",
  "pagar",
  "paga",
  "pagas",
  "pagamento",
  "pagamentos",
  "pago",
  "fornecedor",
  "fornecedores",
  "despesa",
  "despesas",
  "saida",
  "saidas",
  "debito",
];

const TERMOS_RECEBIDA = [
  "contas a receber",
  "contas recebidas",
  "receber",
  "recebida",
  "recebidas",
  "recebimento",
  "recebimentos",
  "recebido",
  "cliente",
  "clientes",
  "receita",
  "receitas",
  "entrada",
  "entradas",
  "credito",
];

function normalizar(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function acharColuna(colunas: string[], chave: ChaveColuna): string | null {
  const alvos = ALIASES[chave] ?? [];
  const normalizadas = colunas.map((coluna) => ({
    original: coluna,
    normalizada: normalizar(coluna),
  }));

  for (const alvo of alvos) {
    const alvoNormalizado = normalizar(alvo);
    const achou = normalizadas.find((coluna) => coluna.normalizada === alvoNormalizado);
    if (achou) return achou.original;
  }

  for (const alvo of alvos) {
    const alvoNormalizado = normalizar(alvo);
    const achou = normalizadas.find((coluna) => coluna.normalizada.includes(alvoNormalizado));
    if (achou) return achou.original;
  }

  return null;
}

function temSinalNegativoVisivel(v: unknown): boolean {
  if (v == null || v === "") return false;
  const texto = String(v)
    .trim()
    .replace(/[\u2212\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-");
  return texto.includes("-") || /\([^)]*\d[^)]*\)/.test(texto);
}

function parseValor(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null || v === "") return 0;

  const original = String(v)
    .trim()
    .replace(/[\u2212\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-");
  const negativo = temSinalNegativoVisivel(original);
  let texto = original.replace(/[^\d,.-]/g, "").replace(/-/g, "");

  const ultimaVirgula = texto.lastIndexOf(",");
  const ultimoPonto = texto.lastIndexOf(".");

  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    const separadorDecimal = ultimaVirgula > ultimoPonto ? "," : ".";
    const separadorMilhar = separadorDecimal === "," ? "." : ",";
    texto = texto.split(separadorMilhar).join("").replace(separadorDecimal, ".");
  } else if (ultimaVirgula >= 0) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(texto)) {
    texto = texto.replace(/\./g, "");
  }

  const numero = Number(texto);
  if (!Number.isFinite(numero)) return 0;
  return negativo ? -Math.abs(numero) : numero;
}

function parseValorCelula(valorBruto: unknown, valorFormatado: unknown): number {
  if (temSinalNegativoVisivel(valorFormatado)) return parseValor(valorFormatado);
  if (temSinalNegativoVisivel(valorBruto)) return parseValor(valorBruto);

  const formatado = parseValor(valorFormatado);
  if (formatado) return Math.abs(formatado);

  const bruto = parseValor(valorBruto);
  return bruto < 0 ? bruto : Math.abs(bruto);
}

function textoCelula(valorFormatado: unknown, valorBruto: unknown): string {
  const formatado = String(valorFormatado ?? "").trim();
  if (formatado) return formatado;
  return String(valorBruto ?? "").trim();
}

function formatarData(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseData(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return formatarData(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return formatarData(d.y, d.m, d.d);
  }

  const s = String(v).trim();
  const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (br) return formatarData(Number(br[3]), Number(br[2]), Number(br[1]));

  const mesAno = s.match(/^(\d{1,2})[/-](\d{4})$/);
  if (mesAno) return formatarData(Number(mesAno[2]), Number(mesAno[1]), 1);

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return s.slice(0, 10);

  return null;
}

function competenciaDaData(data: string): string {
  return `${data.slice(0, 7)}-01`;
}

function pontuar(contexto: string, termos: string[]): number {
  return termos.reduce((total, termo) => total + (contexto.includes(normalizar(termo)) ? 1 : 0), 0);
}

function inferirTipoDaAba(
  nomeAba: string,
  colunas: string[],
  tipoPadrao: TipoLancamento,
): TipoLancamento {
  const contexto = normalizar(`${nomeAba} ${colunas.join(" ")}`);
  const pontosPaga = pontuar(contexto, TERMOS_PAGA);
  const pontosRecebida = pontuar(contexto, TERMOS_RECEBIDA);

  if (pontosPaga > pontosRecebida) return "paga";
  if (pontosRecebida > pontosPaga) return "recebida";
  return tipoPadrao;
}

function inferirTipoPorCodigo(...valores: string[]): TipoLancamento | null {
  for (const valor of valores) {
    const texto = normalizar(valor);
    const codigo = texto.match(/^\s*(\d+)(?:[.\-\s]|$)/)?.[1];
    if (!codigo) continue;
    if (codigo.startsWith("1")) return "recebida";
    if (["2", "3", "4", "5"].some((prefixo) => codigo.startsWith(prefixo))) return "paga";
  }
  return null;
}

function combinarCodigoCategoria(codigo: string, categoria: string): string {
  const codigoLimpo = codigo.trim();
  const categoriaLimpa = categoria.trim();
  if (!codigoLimpo) return categoriaLimpa;
  if (!categoriaLimpa) return codigoLimpo;
  if (normalizar(categoriaLimpa).startsWith(normalizar(codigoLimpo))) return categoriaLimpa;
  return `${codigoLimpo} - ${categoriaLimpa}`;
}

function gerarHash(linha: Omit<LinhaImportada, "hash">, origem: string): string {
  const origemEstavel = linha.nibo_id ? `nibo:${normalizar(linha.nibo_id)}` : origem;
  return [
    linha.tipo,
    linha.data_efetiva,
    origemEstavel,
    linha.valor.toFixed(2),
    normalizar(linha.descricao),
    normalizar(linha.pessoa),
    normalizar(linha.categoria_nibo),
    normalizar(linha.centro_custo),
  ].join("|");
}

export function parseBufferNibo(buffer: ArrayBuffer, dataPadrao: string): ResultadoParse {
  const wb = XLSX.read(buffer, { cellDates: true });
  const erros: string[] = [];
  const avisos: string[] = [];
  const colunasArquivo = new Set<string>();

  if (!wb.SheetNames.length) {
    return { linhas: [], colunas: [], erros: ["Arquivo sem planilhas."], avisos };
  }

  const candidatas: LinhaCandidata[] = [];
  let abasLidas = 0;

  for (const nomeAba of wb.SheetNames) {
    const sheet = wb.Sheets[nomeAba];
    if (!sheet) continue;

    const bruto = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: true,
    });
    const formatado = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
    if (!bruto.length) {
      avisos.push(`Aba "${nomeAba}" ignorada: nenhum registro encontrado.`);
      continue;
    }

    const colunas = Array.from(
      new Set([...Object.keys(bruto[0] ?? {}), ...Object.keys(formatado[0] ?? {})]),
    );
    colunas.forEach((coluna) => colunasArquivo.add(coluna));

    const colData = acharColuna(colunas, "data");
    const colValor = acharColuna(colunas, "valor");
    const colDesc = acharColuna(colunas, "descricao");
    const colCat = acharColuna(colunas, "categoria");
    const colCodigo = acharColuna(colunas, "codigo");
    const colPessoa = acharColuna(colunas, "pessoa");
    const colCentro = acharColuna(colunas, "centro");
    const colBanco = acharColuna(colunas, "banco");
    const colNiboId =
      colunas.find((coluna) => normalizar(coluna) === "id") ??
      colunas.find((coluna) => normalizar(coluna) === "codigo nibo") ??
      null;

    if (!colValor) {
      avisos.push(`Aba "${nomeAba}" ignorada: coluna de valor não encontrada.`);
      continue;
    }
    if (!colCat) {
      avisos.push(`Aba "${nomeAba}": coluna de categoria não encontrada.`);
    }
    if (!colData) {
      avisos.push(
        `Aba "${nomeAba}": coluna de data não encontrada; usando a competência selecionada.`,
      );
    }

    abasLidas += 1;
    const tipoContexto = inferirTipoDaAba(nomeAba, colunas, "recebida");
    let datasInvalidas = 0;

    bruto.forEach((row, index) => {
      const rowFormatada = formatado[index] ?? {};
      const valorAssinado = parseValorCelula(row[colValor], rowFormatada[colValor]);

      if (!valorAssinado) return;
      const codigo_nibo = colCodigo ? textoCelula(rowFormatada[colCodigo], row[colCodigo]) : "";
      const nibo_id = colNiboId ? textoCelula(rowFormatada[colNiboId], row[colNiboId]) : "";
      const categoria = colCat ? textoCelula(rowFormatada[colCat], row[colCat]) : "";
      const dataEfetiva = colData
        ? (parseData(row[colData]) ?? parseData(rowFormatada[colData]))
        : null;
      if (colData && !dataEfetiva) datasInvalidas += 1;

      candidatas.push({
        tipoContexto,
        data_efetiva: dataEfetiva ?? dataPadrao,
        competencia: competenciaDaData(dataEfetiva ?? dataPadrao),
        descricao: colDesc ? textoCelula(rowFormatada[colDesc], row[colDesc]) : "",
        categoria_nibo: combinarCodigoCategoria(codigo_nibo, categoria),
        codigo_nibo,
        pessoa: colPessoa ? textoCelula(rowFormatada[colPessoa], row[colPessoa]) : "",
        centro_custo: colCentro ? textoCelula(rowFormatada[colCentro], row[colCentro]) : "",
        conta_bancaria: colBanco ? textoCelula(rowFormatada[colBanco], row[colBanco]) : "",
        nibo_id,
        valorAssinado,
        origem: `${nomeAba}:${index + 2}`,
      });
    });

    if (datasInvalidas) {
      avisos.push(
        `Aba "${nomeAba}": ${datasInvalidas} linha(s) sem data válida usaram a competência selecionada.`,
      );
    }
  }

  if (abasLidas > 1) avisos.push(`Foram lidas ${abasLidas} abas do arquivo.`);

  if (!candidatas.length) {
    const mensagem = abasLidas
      ? "Nenhum lançamento válido encontrado no arquivo."
      : "Nenhuma aba válida encontrada no arquivo.";
    erros.push(mensagem);
    return { linhas: [], colunas: Array.from(colunasArquivo), erros, avisos };
  }

  const temPositivo = candidatas.some((linha) => linha.valorAssinado > 0);
  const temNegativo = candidatas.some((linha) => linha.valorAssinado < 0);
  const arquivoMisto = temPositivo && temNegativo;

  if (arquivoMisto) {
    avisos.push(
      "Arquivo misto detectado: valores positivos foram tratados como recebidos e negativos como pagos.",
    );
  }

  let divergenciasSinalCategoria = 0;

  const linhas = candidatas.map((linha) => {
    const tipoPorCodigo = inferirTipoPorCodigo(linha.codigo_nibo, linha.categoria_nibo);
    const tipoPorSinal: TipoLancamento = linha.valorAssinado < 0 ? "paga" : "recebida";
    const tipoLinha: TipoLancamento = arquivoMisto
      ? tipoPorSinal
      : (tipoPorCodigo ?? linha.tipoContexto ?? tipoPorSinal);
    const valorLinha =
      arquivoMisto || tipoLinha === tipoPorSinal
        ? linha.valorAssinado
        : tipoLinha === "paga"
          ? -Math.abs(linha.valorAssinado)
          : Math.abs(linha.valorAssinado);

    if (
      (tipoPorCodigo && tipoPorCodigo !== tipoPorSinal) ||
      (!tipoPorCodigo && linha.tipoContexto !== tipoPorSinal)
    ) {
      divergenciasSinalCategoria += 1;
    }

    const normalizada: Omit<LinhaImportada, "hash"> = {
      tipo: tipoLinha,
      data_efetiva: linha.data_efetiva,
      competencia: linha.competencia,
      descricao: linha.descricao,
      categoria_nibo: linha.categoria_nibo,
      pessoa: linha.pessoa,
      centro_custo: linha.centro_custo,
      conta_bancaria: linha.conta_bancaria,
      valor: valorLinha,
    };
    if (linha.nibo_id) normalizada.nibo_id = linha.nibo_id;

    return { ...normalizada, hash: gerarHash(normalizada, linha.origem) };
  });

  if (divergenciasSinalCategoria) {
    avisos.push(
      `${divergenciasSinalCategoria} linha(s) tinham categoria/aba divergente, mas o sinal do valor foi priorizado.`,
    );
  }

  return { linhas, colunas: Array.from(colunasArquivo), erros, avisos };
}

export async function parseArquivoNibo(file: File, dataPadrao: string): Promise<ResultadoParse> {
  const buffer = await file.arrayBuffer();
  return parseBufferNibo(buffer, dataPadrao);
}
