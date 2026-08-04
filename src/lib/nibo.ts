import * as XLSX from "xlsx";

export interface LinhaImportada {
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

const ALIASES: Record<string, string[]> = {
  data: [
    "data de pagamento",
    "data do pagamento",
    "data de recebimento",
    "data do recebimento",
    "data de liquidacao",
    "data pagamento",
    "data recebimento",
    "data",
    "vencimento",
  ],
  valor: ["valor pago", "valor recebido", "valor liquido", "valor", "total"],
  descricao: ["descricao", "descrição", "historico", "histórico", "observacao", "memo"],
  categoria: ["categoria", "plano de contas", "conta", "classificacao"],
  pessoa: ["cliente", "fornecedor", "pessoa", "nome", "cliente/fornecedor"],
  centro: ["centro de custo", "centro custo", "centro de resultado"],
  banco: ["conta bancaria", "conta bancária", "banco", "conta corrente"],
};

function normalizar(s: string): string {
  return s
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function acharColuna(colunas: string[], chave: keyof typeof ALIASES): string | null {
  const alvos = ALIASES[chave] ?? [];
  for (const alvo of alvos) {
    const achou = colunas.find((c) => normalizar(c) === normalizar(alvo));
    if (achou) return achou;
  }
  for (const alvo of alvos) {
    const achou = colunas.find((c) => normalizar(c).includes(normalizar(alvo)));
    if (achou) return achou;
  }
  return null;
}

function parseValor(v: unknown): number {
  if (typeof v === "number") return Math.abs(v);
  if (v == null) return 0;
  const texto = String(v)
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[()]/g, "");
  const n = Number(texto);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function parseData(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return s.slice(0, 10);
  return null;
}

export async function parseArquivoNibo(
  file: File,
  tipo: "recebida" | "paga",
): Promise<ResultadoParse> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { cellDates: true });
  const nomeAba = wb.SheetNames[0];
  const erros: string[] = [];
  const avisos: string[] = [];
  if (!nomeAba) return { linhas: [], colunas: [], erros: ["Arquivo sem planilhas."], avisos };

  const sheet = wb.Sheets[nomeAba];
  if (!sheet) return { linhas: [], colunas: [], erros: ["Planilha vazia."], avisos };

  const bruto = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (!bruto.length) return { linhas: [], colunas: [], erros: ["Nenhum registro encontrado."], avisos };

  const colunas = Object.keys(bruto[0] ?? {});
  const colData = acharColuna(colunas, "data");
  const colValor = acharColuna(colunas, "valor");
  const colDesc = acharColuna(colunas, "descricao");
  const colCat = acharColuna(colunas, "categoria");
  const colPessoa = acharColuna(colunas, "pessoa");
  const colCentro = acharColuna(colunas, "centro");
  const colBanco = acharColuna(colunas, "banco");

  if (!colData) erros.push("Coluna de data (pagamento/recebimento) não encontrada.");
  if (!colValor) erros.push("Coluna de valor não encontrada.");
  if (!colCat) avisos.push("Coluna de categoria não encontrada — lançamentos ficarão sem classificação.");
  if (erros.length) return { linhas: [], colunas, erros, avisos };

  const linhas: LinhaImportada[] = [];
  let semData = 0;

  bruto.forEach((row) => {
    const data = parseData(row[colData!]);
    const valor = parseValor(row[colValor!]);
    if (!data) {
      semData += 1;
      return;
    }
    if (!valor) return;
    const descricao = String(colDesc ? (row[colDesc] ?? "") : "").trim();
    const categoria_nibo = String(colCat ? (row[colCat] ?? "") : "").trim();
    const pessoa = String(colPessoa ? (row[colPessoa] ?? "") : "").trim();
    const centro_custo = String(colCentro ? (row[colCentro] ?? "") : "").trim();
    const conta_bancaria = String(colBanco ? (row[colBanco] ?? "") : "").trim();
    const hash = `${tipo}|${data}|${valor.toFixed(2)}|${normalizar(descricao)}|${normalizar(pessoa)}|${normalizar(categoria_nibo)}`;
    linhas.push({
      data_efetiva: data,
      descricao,
      categoria_nibo,
      pessoa,
      centro_custo,
      conta_bancaria,
      valor,
      hash,
    });
  });

  if (semData) avisos.push(`${semData} linha(s) ignorada(s) por não conter data efetiva.`);
  if (!linhas.length) erros.push("Nenhum lançamento válido encontrado no arquivo.");

  // duplicidades dentro do próprio arquivo
  const vistos = new Set<string>();
  const unicas: LinhaImportada[] = [];
  let dupInternas = 0;
  for (const l of linhas) {
    const k = l.hash;
    if (vistos.has(k)) {
      dupInternas += 1;
      continue;
    }
    vistos.add(k);
    unicas.push(l);
  }
  if (dupInternas) avisos.push(`${dupInternas} duplicidade(s) dentro do próprio arquivo removida(s).`);

  return { linhas: unicas, colunas, erros, avisos };
}
