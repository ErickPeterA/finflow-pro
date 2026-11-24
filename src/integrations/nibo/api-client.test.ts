import assert from "node:assert/strict";
import test from "node:test";
import { adaptarBaixasNibo, deveEntrarDreNibo } from "./api-adapter";
import { NiboApiClient, NiboApiError } from "./api-client";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("payments: consulta uma pagina com filtro, ordenacao e token no header", async () => {
  const calls: Array<{ url: URL; token: string | null }> = [];
  const client = new NiboApiClient({
    token: "segredo",
    fetchImpl: async (input, init) => {
      calls.push({
        url: new URL(String(input)),
        token: new Headers(init?.headers).get("ApiToken"),
      });
      return json({ items: [{ paymentId: "1" }], count: 1 });
    },
  });
  const result = await client.listAll("payments", "2026-01-01", "2026-01-31");
  assert.equal(result.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url.searchParams.get("$top"), "500");
  assert.equal(calls[0]!.url.searchParams.get("$orderby"), "date asc");
  assert.equal(calls[0]!.token, "segredo");
});

test("payments: pagina alem de 500 registros", async () => {
  let calls = 0;
  const client = new NiboApiClient({
    token: "x",
    fetchImpl: async () => {
      calls++;
      const size = calls === 1 ? 500 : 2;
      return json({ items: Array.from({ length: size }, (_, id) => ({ id })), count: 502 });
    },
  });
  assert.equal((await client.listAll("payments", "2026-01-01", "2026-12-31")).length, 502);
  assert.equal(calls, 2);
});

test("receipts: usa o endpoint de recebimentos", async () => {
  let pathname = "";
  const client = new NiboApiClient({
    token: "x",
    fetchImpl: async (input) => {
      pathname = new URL(String(input)).pathname;
      return json({ items: [], count: 0 });
    },
  });
  await client.listAll("receipts", "2026-01-01", "2026-01-31");
  assert.match(pathname, /\/receipts$/);
});

for (const status of [401, 403, 500]) {
  test(`erro HTTP ${status} e convertido em erro amigavel`, async () => {
    const client = new NiboApiClient({ token: "x", fetchImpl: async () => json({}, status) });
    await assert.rejects(
      () => client.listAll("payments", "2026-01-01", "2026-01-31"),
      (error: unknown) =>
        error instanceof NiboApiError && error.status === status && !error.message.includes("x"),
    );
  });
}

test("timeout aborta a consulta", async () => {
  const client = new NiboApiClient({
    token: "x",
    timeoutMs: 5,
    fetchImpl: (_input, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        ),
      ),
  });
  await assert.rejects(
    () => client.listAll("payments", "2026-01-01", "2026-01-31"),
    /tempo limite/,
  );
});

test("periodo sem registros retorna lista vazia", async () => {
  const client = new NiboApiClient({
    token: "x",
    fetchImpl: async () => new Response(null, { status: 204 }),
  });
  assert.deepEqual(await client.listAll("payments", "2026-01-01", "2026-01-31"), []);
});

test("adapter preserva ID, categoria, pessoa e sinal e usa regime de caixa", () => {
  const payload = {
    paymentId: "p1",
    date: "2026-02-10",
    accrualDate: "2026-01-15",
    description: "Servico",
    value: 100,
    stakeholder: { name: "Fornecedor", cpfCnpj: "123" },
    categories: [{ id: "cat1", categoryName: "2 - Custos", parent: "Custos", value: 100 }],
    costCenters: [{ id: "cc1", description: "Operacao", percent: 100 }],
    account: { name: "Banco" },
  };
  const [row] = adaptarBaixasNibo([payload], "paga");
  assert.equal(row?.external_id, "p1:cat:cat1:0:cc:cc1:0");
  assert.equal(row?.competencia, "2026-02-01");
  assert.equal(row?.valor, -100);
  assert.equal(row?.pessoa, "Fornecedor");
  assert.equal(row?.cpf_cnpj, "123");
});

test("adapter reconhece o formato real de baixas com entryId e identifier", () => {
  const [row] = adaptarBaixasNibo(
    [
      {
        entryId: "e1",
        date: "2026-11-10",
        identifier: "Honorarios",
        value: 250,
        category: { id: "c1", name: "Receitas" },
      },
    ],
    "recebida",
  );
  assert.equal(row?.external_id, "e1:cat:c1:0:cc:none:0");
  assert.equal(row?.descricao, "Honorarios");
  assert.equal(row?.competencia, "2026-11-01");
  assert.equal(row?.valor, 250);
});

test("adapter gera identificador e hash estaveis para deduplicacao e atualizacao", () => {
  const payload = { receiptId: "r1", date: "2026-02-10", value: 50 };
  const first = adaptarBaixasNibo([payload], "recebida")[0]!;
  const same = adaptarBaixasNibo([payload], "recebida")[0]!;
  const changed = adaptarBaixasNibo([{ ...payload, value: 60 }], "recebida")[0]!;
  assert.equal(first.external_id, same.external_id);
  assert.equal(first.source_content_hash, same.source_content_hash);
  assert.equal(first.external_id, changed.external_id);
  assert.notEqual(first.source_content_hash, changed.source_content_hash);
});

test("adapter recusa registro sem ID original", () => {
  assert.throws(
    () => adaptarBaixasNibo([{ date: "2026-01-01", value: 1 }], "recebida"),
    /sem identificador/,
  );
});

test("filtro do DRE exclui somente transferencias, como o painel de caixa do Nibo", () => {
  assert.equal(deveEntrarDreNibo({ isTransfer: true, isReconciliated: true }), false);
  assert.equal(deveEntrarDreNibo({ isTransfer: false, isReconciliated: false }), true);
  assert.equal(deveEntrarDreNibo({ isTransfer: false, isReconciliated: true }), true);
});

test("adapter preserva rateios repetidos sem colisao e conserva o valor por categoria", () => {
  const rows = adaptarBaixasNibo(
    [
      {
        entryId: "e-rateado",
        date: "2026-11-10",
        value: 100,
        categories: [
          { id: "rateio-1", categoryId: "cat-a", categoryName: "1.2 Receita", value: 60 },
          { id: "rateio-2", categoryId: "cat-a", categoryName: "1.2 Receita", value: 40 },
        ],
        costCenters: [
          { costCenterId: "cc-a", percent: 70 },
          { costCenterId: "cc-b", percent: 30 },
        ],
      },
    ],
    "recebida",
  );
  assert.equal(rows.length, 4);
  assert.equal(new Set(rows.map((row) => row.external_id)).size, 4);
  assert.equal(
    rows.reduce((sum, row) => sum + row.valor, 0),
    100,
  );
});

test("adapter nao transforma rateio de categoria com valor zero em divisao igual", () => {
  const rows = adaptarBaixasNibo(
    [
      {
        entryId: "e-zero",
        date: "2026-11-10",
        value: 100,
        categories: [
          { id: "a", categoryName: "Receita", value: 100 },
          { id: "b", categoryName: "Sem valor", value: 0 },
        ],
      },
    ],
    "recebida",
  );
  assert.deepEqual(
    rows.map((row) => row.valor),
    [100, 0],
  );
});

test("adapter normaliza rateios originais ao valor efetivamente baixado", () => {
  const rows = adaptarBaixasNibo(
    [
      {
        entryId: "baixa-parcial",
        date: "2026-11-10",
        value: 50,
        isReconciliated: false,
        categories: [
          { id: "a", categoryName: "1.2 Honorarios", value: 80 },
          { id: "b", categoryName: "1.6 Sucumbencia", value: 20 },
        ],
      },
    ],
    "recebida",
  );
  assert.deepEqual(
    rows.map((row) => row.valor),
    [40, 10],
  );
  assert.equal(
    rows.reduce((sum, row) => sum + row.valor, 0),
    50,
  );
});
