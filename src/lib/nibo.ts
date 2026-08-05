import * as XLSX from "xlsx";

export type TipoLancamento = "recebida" | "paga";

export interface LinhaImportada {
  tipo: TipoLancamento;
  data_efetiva: string;
  descricao: string;
  categoria_nibo: string;
  pessoa: string;
  centro_custo: string;
  conta_bancaria: string;
  valor: number;
  hash: string;
}

export interface ResultadoParse {
  linhas: LinhaImportada[];
  colunas: string[];
  erros: string[];
  avisos: string[];
}

type ChaveColuna =
  | "data"
  | "valor"
  | "descricao"
  | "categoria"
  | "codigo"
  | "pessoa"
  | "centro"
  | "banco";

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
  descricao: ["descricao", "descrição", "historico", "histórico", "observacao", "observação", "memo"],
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
  pessoa: ["cliente", "fornecedor", "pessoa", "nome", "cliente/fornecedor", "favorecido", "pagador"],
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
  const normalizadas = colunas.map((coluna) => ({ original: coluna, normalizada: normalizar(coluna) }));

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

function parseValor(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null || v === "") return 0;

  const original = String(v).trim();
  const negativo = original.includes("-") || /^\(.*\)$/.test(original);
  let texto = original
    .replace(/[R$\s]/g, "")
    .replace(/[()]/g, "")
    .replace(/-/g, "");

  if (texto.includes(",")) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(texto)) {
    texto = texto.replace(/\./g, "");
  }

  const numero = Number(texto);
  if (!Number.isFinite(numero)) return 0;
  return negativo ? -Math.abs(numero) : numero;
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

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return s.slice(0, 10);

  return null;
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
    if (codigo.startsWith("2")) return "paga";
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
  return [
    linha.tipo,
    linha.data_efetiva,
    origem,
    linha.valor.toFixed(2),
    normalizar(linha.descricao),
    normalizar(linha.pessoa),
    normalizar(linha.categoria_nibo),
  ].join("|");
}

export async function parseArquivoNibo(
  file: File,
  dataPadrao: string,
): Promise<ResultadoParse> {
  const buffer = await file.arrayBuffer();
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

    const bruto = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (!bruto.length) {
      avisos.push(`Aba "${nomeAba}" ignorada: nenhum registro encontrado.`);
      continue;
    }

    const colunas = Object.keys(bruto[0] ?? {});
    colunas.forEach((coluna) => colunasArquivo.add(coluna));

    const colValor = acharColuna(colunas, "valor");
    const colDesc = acharColuna(colunas, "descricao");
    const colCat = acharColuna(colunas, "categoria");
    const colCodigo = acharColuna(colunas, "codigo");
    const colPessoa = acharColuna(colunas, "pessoa");
    const colCentro = acharColuna(colunas, "centro");
    const colBanco = acharColuna(colunas, "banco");

    if (!colValor) {
      avisos.push(`Aba "${nomeAba}" ignorada: coluna de valor não encontrada.`);
      continue;
    }
    if (!colCat) {
      avisos.push(`Aba "${nomeAba}": coluna de categoria não encontrada.`);
    }

    abasLidas += 1;
    const tipoContexto = inferirTipoDaAba(nomeAba, colunas, "recebida");

    bruto.forEach((row, index) => {
      const valorAssinado = parseValor(row[colValor]);

      if (!valorAssinado) return;
      const codigo_nibo = String(colCodigo ? (row[colCodigo] ?? "") : "").trim();
      const categoria = String(colCat ? (row[colCat] ?? "") : "").trim();

      candidatas.push({
        tipoContexto,
        data_efetiva: dataPadrao,
        descricao: String(colDesc ? (row[colDesc] ?? "") : "").trim(),
        categoria_nibo: combinarCodigoCategoria(codigo_nibo, categoria),
        codigo_nibo,
        pessoa: String(colPessoa ? (row[colPessoa] ?? "") : "").trim(),
        centro_custo: String(colCentro ? (row[colCentro] ?? "") : "").trim(),
        conta_bancaria: String(colBanco ? (row[colBanco] ?? "") : "").trim(),
        valorAssinado,
        origem: `${nomeAba}:${index + 2}`,
      });
    });
  }

  if (abasLidas > 1) avisos.push(`Foram lidas ${abasLidas} abas do arquivo.`);
  avisos.push("Datas da planilha ignoradas: todos os lançamentos usam a competência selecionada.");

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

  let classificadasPorCodigo = 0;

  const linhas = candidatas.map((linha) => {
    const tipoPorCodigo = inferirTipoPorCodigo(linha.codigo_nibo, linha.categoria_nibo);
    const tipoLinha: TipoLancamento =
      tipoPorCodigo ??
      (linha.valorAssinado < 0 ? "paga" : arquivoMisto ? "recebida" : linha.tipoContexto);

    if (tipoPorCodigo) classificadasPorCodigo += 1;

    const normalizada: Omit<LinhaImportada, "hash"> = {
      tipo: tipoLinha,
      data_efetiva: linha.data_efetiva,
      descricao: linha.descricao,
      categoria_nibo: linha.categoria_nibo,
      pessoa: linha.pessoa,
      centro_custo: linha.centro_custo,
      conta_bancaria: linha.conta_bancaria,
      valor: Math.abs(linha.valorAssinado),
    };

    return { ...normalizada, hash: gerarHash(normalizada, linha.origem) };
  });

  if (classificadasPorCodigo) {
    avisos.push(
      `${classificadasPorCodigo} linha(s) classificada(s) pelo código/tópico da categoria.`,
    );
  }

  return { linhas, colunas: Array.from(colunasArquivo), erros, avisos };
}
