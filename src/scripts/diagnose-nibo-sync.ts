import pg from "pg";
import {
  adaptarBaixasNibo,
  coletarNomesCentrosCustoNibo,
  deveEntrarDreNibo,
} from "../integrations/nibo/api-adapter";
import { NiboApiClient } from "../integrations/nibo/api-client";
import { tokenNiboDaEmpresa } from "../integrations/nibo/api-config";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
const inicio = process.argv[2] ?? "2026-11-01";
const fim = process.argv[3] ?? "2026-11-30";

function resumo(
  linhas: Array<{ categoria_nibo: string; centro_custo: string; valor: number }>,
  campo: "categoria_nibo" | "centro_custo",
) {
  const valores = new Map<string, number>();
  for (const linha of linhas) {
    const chave = linha[campo] || "(sem informacao)";
    valores.set(chave, (valores.get(chave) ?? 0) + linha.valor);
  }
  return [...valores.entries()]
    .map(([nome, valor]) => ({ nome, valor: Number(valor.toFixed(2)) }))
    .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
}

function estrutura(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 3) return typeof valor;
  if (Array.isArray(valor)) return valor.length ? [estrutura(valor[0], profundidade + 1)] : [];
  if (!valor || typeof valor !== "object") return typeof valor;
  return Object.fromEntries(
    Object.entries(valor as Record<string, unknown>).map(([chave, item]) => [
      chave,
      estrutura(item, profundidade + 1),
    ]),
  );
}

function resumoPorFlags(
  items: Record<string, unknown>[],
  tipo: "paga" | "recebida",
  prefixo: string,
) {
  const grupos = new Map<string, { registros: number; valor: number }>();
  for (const item of items) {
    if (item["isTransfer"] === true) continue;
    const valor = adaptarBaixasNibo([item], tipo)
      .filter((linha) => linha.categoria_nibo.startsWith(prefixo))
      .reduce((soma, linha) => soma + linha.valor, 0);
    if (!valor) continue;
    const chave = JSON.stringify({
      isReconciliated: item["isReconciliated"] ?? null,
      isVirtual: item["isVirtual"] ?? null,
      bankBalanceDateIsGreaterThanEntryDate: item["bankBalanceDateIsGreaterThanEntryDate"] ?? null,
      isFlagged: item["isFlagged"] ?? null,
    });
    const atual = grupos.get(chave) ?? { registros: 0, valor: 0 };
    atual.registros++;
    atual.valor += valor;
    grupos.set(chave, atual);
  }
  return [...grupos.entries()].map(([flags, grupo]) => ({
    flags: JSON.parse(flags),
    registros: grupo.registros,
    valor: Number(grupo.valor.toFixed(2)),
  }));
}

try {
  const empresa = await pool.query<{ id: string; nome: string }>(
    "select id,nome from empresas where nome ilike '%Cachorro%João%' or nome ilike '%Cachorro%Jao%' order by ativo desc limit 1",
  );
  const row = empresa.rows[0];
  if (!row) throw new Error("Empresa Cachorro do Joao nao encontrada.");
  const client = new NiboApiClient({
    token: tokenNiboDaEmpresa(row.id),
    timeoutMs: Number(process.env["NIBO_API_TIMEOUT_MS"] ?? 60_000),
    pageConcurrency: Number(process.env["NIBO_API_PAGE_CONCURRENCY"] ?? 4),
    maxRetries: Number(process.env["NIBO_API_MAX_RETRIES"] ?? 2),
  });
  const [payments, receipts] = await Promise.all([
    client.listAll("payments", inicio, fim),
    client.listAll("receipts", inicio, fim),
  ]);
  const nomesCentros = coletarNomesCentrosCustoNibo(payments);
  coletarNomesCentrosCustoNibo(receipts, nomesCentros);
  const pagas = adaptarBaixasNibo(payments.filter(deveEntrarDreNibo), "paga", nomesCentros);
  const recebidas = adaptarBaixasNibo(receipts.filter(deveEntrarDreNibo), "recebida", nomesCentros);
  const receitasOperacionais = [...recebidas, ...pagas].filter((item) =>
    item.categoria_nibo.trim().startsWith("1."),
  );
  const custosOperacionais = pagas.filter((item) => item.categoria_nibo.trim().startsWith("2."));
  const banco = await pool.query<{
    tipo: "paga" | "recebida";
    categoria_nibo: string;
    centro_custo: string;
    valor: string;
  }>(
    `select tipo,coalesce(categoria_nibo,'') categoria_nibo,coalesce(centro_custo,'') centro_custo,valor::text
     from lancamentos where empresa_id=$1::uuid and external_source='nibo_api'
       and data_efetiva between $2::date and $3::date`,
    [row.id, inicio, fim],
  );
  const linhasBanco = banco.rows.map((item) => ({ ...item, valor: Number(item.valor) }));
  const fontes = await pool.query<{ external_source: string | null; tipo: string; total: string }>(
    `select external_source,tipo,count(*)::text total from lancamentos
     where empresa_id=$1::uuid and data_efetiva between $2::date and $3::date
     group by external_source,tipo order by external_source,tipo`,
    [row.id, inicio, fim],
  );
  console.log(
    JSON.stringify(
      {
        empresa: row.nome,
        periodo: { inicio, fim },
        api: {
          registros: { pagas: payments.length, recebidas: receipts.length },
          linhas: { pagas: pagas.length, recebidas: recebidas.length },
          total: {
            pagas: Number(pagas.reduce((soma, item) => soma + item.valor, 0).toFixed(2)),
            recebidas: Number(recebidas.reduce((soma, item) => soma + item.valor, 0).toFixed(2)),
          },
          dreOperacional: {
            receitas: Number(
              receitasOperacionais.reduce((soma, item) => soma + item.valor, 0).toFixed(2),
            ),
            custos: Number(
              custosOperacionais.reduce((soma, item) => soma + item.valor, 0).toFixed(2),
            ),
            receitasPorCentro: resumo(receitasOperacionais, "centro_custo"),
            custosPorCentro: resumo(custosOperacionais, "centro_custo"),
            receitasPorFlags: resumoPorFlags(receipts, "recebida", "1."),
            custosPorFlags: resumoPorFlags(payments, "paga", "2."),
          },
          recebidasPorCategoria: resumo(recebidas, "categoria_nibo"),
          pagasPorCategoria: resumo(pagas, "categoria_nibo"),
          porCentroCusto: resumo([...pagas, ...recebidas], "centro_custo"),
          estruturaPagamento: estrutura(payments.find(deveEntrarDreNibo)),
          estruturaRecebimento: estrutura(receipts.find(deveEntrarDreNibo)),
        },
        banco: {
          fontes: fontes.rows,
          linhas: linhasBanco.length,
          total: {
            pagas: Number(
              linhasBanco
                .filter((item) => item.tipo === "paga")
                .reduce((soma, item) => soma + item.valor, 0)
                .toFixed(2),
            ),
            recebidas: Number(
              linhasBanco
                .filter((item) => item.tipo === "recebida")
                .reduce((soma, item) => soma + item.valor, 0)
                .toFixed(2),
            ),
          },
          porCentroCusto: resumo(linhasBanco, "centro_custo"),
        },
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
