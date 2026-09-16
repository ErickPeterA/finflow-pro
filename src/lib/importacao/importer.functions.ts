import { createServerFn } from "@tanstack/react-start";
import { requireAuthenticatedUser } from "@/lib/auth-middleware";
import { assertEmpresaAccess } from "@/lib/authorization";
import { withTransaction, query } from "@/lib/postgres";
import type { LinhaImportada, TituloImportado } from "@/lib/nibo";

type ImportData = {
  empresaId: string;
  arquivoNome: string;
  modo: "linhas" | "titulos";
  linhas?: LinhaImportada[];
  titulos?: TituloImportado[];
};

type ResumoImportacao = {
  tipo: "paga" | "recebida";
  competencia: string;
  totalRegistros: number;
  valorTotal: number;
};

// Mantém as inserções dentro do limite de parâmetros do PostgreSQL e evita uma
// viagem ao banco para cada linha do relatório.
const INSERT_BATCH_SIZE = 500;

const unique = <T extends { hash: string }>(rows: T[]) => {
  const seen = new Set<string>();
  let ignored = 0;
  return {
    rows: rows.filter((r) => (seen.has(r.hash) ? (ignored++, false) : (seen.add(r.hash), true))),
    ignored,
  };
};

function placeholdersForRows(rows: unknown[][], offset = 0) {
  const values = rows.flat();
  const placeholders = rows
    .map(
      (row, rowIndex) =>
        `(${row.map((_, columnIndex) => `$${offset + rowIndex * row.length + columnIndex + 1}`).join(",")})`,
    )
    .join(",");
  return { placeholders, values };
}
export const importarManual = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator((d: ImportData) => d)
  .handler(async ({ context, data }) => {
    await assertEmpresaAccess(String(context.userId), data.empresaId);
    const raw = data.modo === "linhas" ? (data.linhas ?? []) : (data.titulos ?? []);
    const { rows, ignored: internal } = unique<LinhaImportada | TituloImportado>(raw);
    if (!rows.length) return { inseridos: 0, atualizados: 0, ignorados: internal };
    return withTransaction(async (c) => {
      if (data.modo === "titulos" && rows.some((row) => row.external_source === "fluxo_caixa")) {
        // Corrige os hashes legados que nao diferenciavam pagar de receber.
        // Assim, uma importacao antiga continua sendo reconhecida sem impedir
        // a entrada do titulo de natureza oposta com o mesmo agendamento NIBO.
        await c.query(
          "update fluxo_titulos_nibo set hash=hash||'|tipo:'||tipo where empresa_id=$1::uuid and external_source='fluxo_caixa' and hash not like '%|tipo:paga' and hash not like '%|tipo:recebida'",
          [data.empresaId],
        );
      }
      const maps = await c.query<{ categoria_nibo: string; categoria_id: string | null }>(
        "select categoria_nibo,categoria_id from mapeamentos where empresa_id=$1",
        [data.empresaId],
      );
      const map = new Map(maps.rows.map((x) => [x.categoria_nibo.toLowerCase(), x.categoria_id]));
      let inseridos = 0,
        ignorados = internal;
      const groups = new Map<string, typeof rows>();
      for (const r of rows) {
        const k = `${r.tipo}|${r.competencia}`;
        const group = groups.get(k);
        if (group) group.push(r);
        else groups.set(k, [r]);
      }
      for (const [key, group] of groups) {
        const [tipo, competencia] = key.split("|");
        const imp = (
          await c.query<{ id: string }>(
            "insert into importacoes (empresa_id,tipo,competencia,arquivo_nome,origem,total_registros,valor_total,duplicados,status) values ($1,$2,$3,$4,'manual',$5,$6,$7,$8) returning id",
            [
              data.empresaId,
              tipo,
              competencia,
              data.arquivoNome,
              group.length,
              group.reduce((s, r) => s + Number(r.valor), 0),
              0,
              data.modo === "titulos" ? "processando_titulos" : "processando",
            ],
          )
        ).rows[0]!;
        let added = 0;
        for (let start = 0; start < group.length; start += INSERT_BATCH_SIZE) {
          const batch = group.slice(start, start + INSERT_BATCH_SIZE);
          const batchRows =
            data.modo === "linhas"
              ? batch.map((r) => {
                  const l = r as LinhaImportada;
                  return [
                    data.empresaId,
                    imp.id,
                    l.tipo,
                    l.data_efetiva,
                    l.competencia,
                    l.descricao,
                    l.categoria_nibo || null,
                    map.get((l.categoria_nibo || "").toLowerCase()) ?? null,
                    l.pessoa || null,
                    l.centro_custo || null,
                    l.conta_bancaria || null,
                    l.valor,
                    l.hash,
                    "manual",
                    l.external_source ?? null,
                    l.external_id ?? null,
                    l.source_content_hash ?? null,
                  ];
                })
              : batch.map((r) => {
                  const t = r as unknown as TituloImportado;
                  return [
                    data.empresaId,
                    imp.id,
                    t.tipo,
                    t.vencimento,
                    t.data_projetada,
                    t.competencia,
                    t.descricao,
                    t.categoria_nibo || null,
                    t.pessoa || null,
                    t.centro_custo || null,
                    t.valor,
                    t.status,
                    t.hash,
                    t.external_source ?? null,
                    t.external_id ?? null,
                    t.source_content_hash ?? null,
                    "{}",
                  ];
                });
          const { placeholders, values } = placeholdersForRows(batchRows);
          const result =
            data.modo === "linhas"
              ? await c.query(
                  `insert into lancamentos (empresa_id,importacao_id,tipo,data_efetiva,competencia,descricao,categoria_nibo,categoria_id,pessoa,centro_custo,conta_bancaria,valor,hash,origem,external_source,external_id,source_content_hash) values ${placeholders} on conflict (empresa_id,hash) do nothing`,
                  values,
                )
              : await c.query(
                  `insert into fluxo_titulos_nibo (empresa_id,importacao_id,tipo,vencimento,data_projetada,competencia,descricao,categoria_nibo,pessoa,centro_custo,valor,status,hash,external_source,external_id,source_content_hash,payload) values ${placeholders} on conflict (empresa_id,hash) do nothing`,
                  values,
                );
          added += result.rowCount ?? 0;
        }
        ignorados += group.length - added;
        inseridos += added;
        await c.query(
          "update importacoes set status=$1,total_registros=$2,duplicados=$3 where id=$4",
          [
            data.modo === "titulos" ? "concluida_titulos" : "concluida",
            added,
            group.length - added,
            imp.id,
          ],
        );
      }
      return { inseridos, atualizados: 0, ignorados };
    });
  });
export const removerImportacaoManual = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator((d: { empresaId: string; importacaoId?: string; tipo?: "paga" | "recebida" }) => d)
  .handler(async ({ context, data }) => {
    await assertEmpresaAccess(String(context.userId), data.empresaId);
    if (data.importacaoId)
      await query("delete from importacoes where id=$1::uuid and empresa_id=$2::uuid", [
        data.importacaoId,
        data.empresaId,
      ]);
    else
      await query("delete from importacoes where empresa_id=$1::uuid and tipo=$2", [
        data.empresaId,
        data.tipo,
      ]);
    return { ok: true };
  });

// A confirmacao de uma planilha grande nao pode ser enviada em uma unica requisicao:
// proxies (incluindo nginx) normalmente recusam esse payload antes de ele chegar ao app.
// Estas tres funcoes mantem uma unica importacao no historico, mas recebem os registros
// em lotes pequenos.
export const iniciarImportacaoManual = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator(
    (d: {
      empresaId: string;
      arquivoNome: string;
      modo: "linhas" | "titulos";
      resumos: ResumoImportacao[];
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await assertEmpresaAccess(String(context.userId), data.empresaId);
    return withTransaction(async (c) => {
      const importacoes: Record<string, string> = {};
      for (const resumo of data.resumos) {
        const key = `${resumo.tipo}|${resumo.competencia}`;
        if (importacoes[key]) continue;
        const result = await c.query<{ id: string }>(
          "insert into importacoes (empresa_id,tipo,competencia,arquivo_nome,origem,total_registros,valor_total,duplicados,status) values ($1,$2,$3,$4,'manual',$5,$6,0,$7) returning id",
          [
            data.empresaId,
            resumo.tipo,
            resumo.competencia,
            data.arquivoNome,
            resumo.totalRegistros,
            resumo.valorTotal,
            data.modo === "titulos" ? "processando_titulos" : "processando",
          ],
        );
        importacoes[key] = result.rows[0]!.id;
      }
      return { importacoes };
    });
  });

export const importarLoteManual = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator(
    (d: {
      empresaId: string;
      importacaoId: string;
      modo: "linhas" | "titulos";
      linhas?: LinhaImportada[];
      titulos?: TituloImportado[];
    }) => d,
  )
  .handler(async ({ context, data }) => {
    await assertEmpresaAccess(String(context.userId), data.empresaId);
    const raw = data.modo === "linhas" ? (data.linhas ?? []) : (data.titulos ?? []);
    const { rows, ignored } = unique<LinhaImportada | TituloImportado>(raw);
    if (!rows.length) return { inseridos: 0, ignorados: ignored };
    return withTransaction(async (c) => {
      if (data.modo === "titulos" && rows.some((row) => row.external_source === "fluxo_caixa")) {
        await c.query(
          "update fluxo_titulos_nibo set hash=hash||'|tipo:'||tipo where empresa_id=$1::uuid and external_source='fluxo_caixa' and hash not like '%|tipo:paga' and hash not like '%|tipo:recebida'",
          [data.empresaId],
        );
      }
      const owner = await c.query(
        "select id from importacoes where id=$1::uuid and empresa_id=$2::uuid for update",
        [data.importacaoId, data.empresaId],
      );
      if (!owner.rowCount) throw new Error("Importacao nao encontrada ou sem acesso.");
      const maps = await c.query<{ categoria_nibo: string; categoria_id: string | null }>(
        "select categoria_nibo,categoria_id from mapeamentos where empresa_id=$1",
        [data.empresaId],
      );
      const map = new Map(maps.rows.map((x) => [x.categoria_nibo.toLowerCase(), x.categoria_id]));
      const batchRows =
        data.modo === "linhas"
          ? rows.map((r) => {
              const l = r as LinhaImportada;
              return [
                data.empresaId,
                data.importacaoId,
                l.tipo,
                l.data_efetiva,
                l.competencia,
                l.descricao,
                l.categoria_nibo || null,
                map.get((l.categoria_nibo || "").toLowerCase()) ?? null,
                l.pessoa || null,
                l.centro_custo || null,
                l.conta_bancaria || null,
                l.valor,
                l.hash,
                "manual",
                l.external_source ?? null,
                l.external_id ?? null,
                l.source_content_hash ?? null,
              ];
            })
          : rows.map((r) => {
              const t = r as unknown as TituloImportado;
              return [
                data.empresaId,
                data.importacaoId,
                t.tipo,
                t.vencimento,
                t.data_projetada,
                t.competencia,
                t.descricao,
                t.categoria_nibo || null,
                t.pessoa || null,
                t.centro_custo || null,
                t.valor,
                t.status,
                t.hash,
                t.external_source ?? null,
                t.external_id ?? null,
                t.source_content_hash ?? null,
                "{}",
              ];
            });
      const { placeholders, values } = placeholdersForRows(batchRows);
      const result =
        data.modo === "linhas"
          ? await c.query(
              `insert into lancamentos (empresa_id,importacao_id,tipo,data_efetiva,competencia,descricao,categoria_nibo,categoria_id,pessoa,centro_custo,conta_bancaria,valor,hash,origem,external_source,external_id,source_content_hash) values ${placeholders} on conflict (empresa_id,hash) do nothing`,
              values,
            )
          : await c.query(
              `insert into fluxo_titulos_nibo (empresa_id,importacao_id,tipo,vencimento,data_projetada,competencia,descricao,categoria_nibo,pessoa,centro_custo,valor,status,hash,external_source,external_id,source_content_hash,payload) values ${placeholders} on conflict (empresa_id,hash) do nothing`,
              values,
            );
      return {
        inseridos: result.rowCount ?? 0,
        ignorados: ignored + rows.length - (result.rowCount ?? 0),
      };
    });
  });

export const finalizarImportacaoManual = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator((d: { empresaId: string; modo: "linhas" | "titulos"; importacaoIds: string[] }) => d)
  .handler(async ({ context, data }) => {
    await assertEmpresaAccess(String(context.userId), data.empresaId);
    for (const id of data.importacaoIds) {
      const table = data.modo === "linhas" ? "lancamentos" : "fluxo_titulos_nibo";
      const count = await query<{ total: string }>(
        `select count(*)::text as total from ${table} where importacao_id=$1::uuid and empresa_id=$2::uuid`,
        [id, data.empresaId],
      );
      await query(
        "update importacoes set status=$1,duplicados=greatest(0, total_registros-$2) where id=$3::uuid and empresa_id=$4::uuid",
        [
          data.modo === "titulos" ? "concluida_titulos" : "concluida",
          Number(count.rows[0]?.total ?? 0),
          id,
          data.empresaId,
        ],
      );
    }
    return { ok: true };
  });
