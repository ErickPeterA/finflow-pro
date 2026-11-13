import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import pg from "pg";
import { parseBufferNibo, type LinhaImportada } from "../lib/nibo";

type Args = {
  empresaId: string;
  apply: boolean;
  files: string[];
};

function parseArgs(argv: string[]): Args {
  const apply = argv.includes("--apply");
  const empresaIndex = argv.indexOf("--empresa-id");
  const empresaId = empresaIndex >= 0 ? (argv[empresaIndex + 1] ?? "") : "";
  const files = argv.filter(
    (arg, index) =>
      !arg.startsWith("--") && index !== empresaIndex + 1 && /\.(xlsx|xls)$/i.test(arg),
  );
  if (!empresaId || !files.length) {
    throw new Error(
      "Uso: tsx recover-identical-import-rows.ts --empresa-id UUID [--apply] arquivo.xlsx ...",
    );
  }
  return { empresaId, apply, files };
}

async function databaseUrl() {
  if (process.env["DATABASE_URL"]) return process.env["DATABASE_URL"];
  const env = await readFile(".env", "utf8");
  const line = env.split(/\r?\n/).find((item) => item.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL nao encontrada.");
  return line.slice("DATABASE_URL=".length).replace(/^['"]|['"]$/g, "");
}

async function parseFiles(files: string[]) {
  const rows: LinhaImportada[] = [];
  for (const file of files) {
    const buffer = await readFile(file);
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
    const parsed = parseBufferNibo(arrayBuffer, new Date().toISOString().slice(0, 10));
    if (parsed.erros.length) throw new Error(`${basename(file)}: ${parsed.erros.join(" | ")}`);
    rows.push(...parsed.linhas);
  }
  return rows;
}

const args = parseArgs(process.argv.slice(2));
const rows = await parseFiles(args.files);
const client = new pg.Client({ connectionString: await databaseUrl() });
await client.connect();

try {
  const company = await client.query<{ nome: string }>(
    "select nome from empresas where id=$1::uuid",
    [args.empresaId],
  );
  if (!company.rowCount) throw new Error("Empresa nao encontrada.");

  const existing = await client.query<{ hash: string }>(
    "select hash from lancamentos where empresa_id=$1::uuid",
    [args.empresaId],
  );
  const existingHashes = new Set(existing.rows.map((row) => row.hash));
  const missing = rows.filter((row) => !existingHashes.has(row.hash));
  const summary = new Map<string, { registros: number; valor: number }>();
  for (const row of missing) {
    const key = `${row.tipo}|${row.competencia}`;
    const item = summary.get(key) ?? { registros: 0, valor: 0 };
    item.registros += 1;
    item.valor += row.valor;
    summary.set(key, item);
  }

  console.log(
    JSON.stringify(
      {
        empresa: company.rows[0]!.nome,
        arquivos: args.files.map((file) => basename(file)),
        lidos: rows.length,
        ausentes: missing.length,
        porCompetencia: Object.fromEntries(summary),
        modo: args.apply ? "apply" : "dry-run",
      },
      null,
      2,
    ),
  );

  if (!args.apply || !missing.length) process.exitCode = 0;
  else {
    await client.query("begin");
    const mappings = await client.query<{ categoria_nibo: string; categoria_id: string | null }>(
      "select categoria_nibo,categoria_id from mapeamentos where empresa_id=$1::uuid",
      [args.empresaId],
    );
    const categoryMap = new Map(
      mappings.rows.map((row) => [row.categoria_nibo.toLowerCase(), row.categoria_id]),
    );

    for (const [key, item] of summary) {
      const [tipo, competencia] = key.split("|");
      const imported = await client.query<{ id: string }>(
        "insert into importacoes (empresa_id,tipo,competencia,arquivo_nome,origem,total_registros,valor_total,duplicados,status) values ($1,$2,$3,$4,'manual',$5,$6,0,'concluida') returning id",
        [
          args.empresaId,
          tipo,
          competencia,
          `Recuperacao de ocorrencias identicas: ${args.files.map((file) => basename(file)).join(", ")}`,
          item.registros,
          item.valor,
        ],
      );
      const importId = imported.rows[0]!.id;
      for (const row of missing.filter(
        (candidate) => candidate.tipo === tipo && candidate.competencia === competencia,
      )) {
        await client.query(
          "insert into lancamentos (empresa_id,importacao_id,tipo,data_efetiva,competencia,descricao,categoria_nibo,categoria_id,pessoa,centro_custo,conta_bancaria,valor,hash,origem,external_source,external_id,source_content_hash) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'manual',$14,$15,$16) on conflict (empresa_id,hash) do nothing",
          [
            args.empresaId,
            importId,
            row.tipo,
            row.data_efetiva,
            row.competencia,
            row.descricao,
            row.categoria_nibo || null,
            categoryMap.get(row.categoria_nibo.toLowerCase()) ?? null,
            row.pessoa || null,
            row.centro_custo || null,
            row.conta_bancaria || null,
            row.valor,
            row.hash,
            row.external_source ?? null,
            row.external_id ?? null,
            row.source_content_hash ?? null,
          ],
        );
      }
    }
    await client.query("commit");
  }
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
