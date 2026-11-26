import { createHash } from "node:crypto";
import type { LinhaImportada, TipoLancamento } from "@/lib/nibo";

type ApiRecord = Record<string, unknown>;

function record(value: unknown): ApiRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as ApiRecord) : null;
}

function text(...values: unknown[]) {
  const value = values.find((item) => typeof item === "string" && item.trim());
  return typeof value === "string" ? value.trim() : "";
}

function number(...values: unknown[]) {
  const value = values.find(
    (item) => typeof item === "number" || (typeof item === "string" && item.trim()),
  );
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown): number | null {
  if (typeof value !== "number" && !(typeof value === "string" && value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function date(value: unknown) {
  const match = String(value ?? "").match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? "";
}

function array(value: unknown): ApiRecord[] {
  return Array.isArray(value) ? value.map(record).filter((item): item is ApiRecord => !!item) : [];
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Distribui dinheiro preservando exatamente o total em centavos. */
function allocateMoney(total: number, weights: number[]) {
  if (!weights.length) return [];
  const totalCents = Math.round(Math.abs(total) * 100);
  const positiveWeights = weights.map((weight) => Math.max(0, weight));
  const weightTotal = positiveWeights.reduce((sum, weight) => sum + weight, 0);
  const normalized = weightTotal > 0 ? positiveWeights : weights.map(() => 1);
  const normalizedTotal = normalized.reduce((sum, weight) => sum + weight, 0);
  const exact = normalized.map((weight) => (totalCents * weight) / normalizedTotal);
  const cents = exact.map(Math.floor);
  const remainder = totalCents - cents.reduce((sum, value) => sum + value, 0);
  const priority = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < remainder; index++) {
    cents[priority[index % priority.length]!.index]! += 1;
  }
  return cents.map((value) => value / 100);
}

export interface NiboApiLinha extends LinhaImportada {
  reference?: string;
  cpf_cnpj?: string;
  categoria_pai?: string;
  payload: ApiRecord;
}

export interface NiboApiTitulo {
  tipo: TipoLancamento;
  vencimento: string;
  data_projetada: string;
  competencia: string;
  descricao: string;
  categoria_nibo: string;
  pessoa: string;
  centro_custo: string;
  valor: number;
  status: "aberto" | "vencido";
  hash: string;
  external_id: string;
  source_content_hash: string;
  payload: ApiRecord;
}

export function obterIdOriginalNibo(item: ApiRecord) {
  return text(item["entryId"], item["paymentId"], item["receiptId"], item["id"]);
}

/** Replica o escopo "Caixa / Realizado" do painel gerencial do Nibo. */
export function deveEntrarDreNibo(item: ApiRecord) {
  // O Painel de Acompanhamento inclui baixas conciliadas e nao conciliadas.
  // Somente transferencias entre contas ficam fora do resultado gerencial.
  return item["isTransfer"] !== true;
}

export function coletarNomesCentrosCustoNibo(
  items: ApiRecord[],
  nomes = new Map<string, string>(),
) {
  for (const item of items) {
    const centers = array(item["costCenters"] ?? item["costcenters"]);
    const single = record(item["costCenter"]);
    if (single) centers.push(single);
    for (const center of centers) {
      const id = text(center["costCenterId"], center["id"]);
      const nome = text(center["costCenterDescription"], center["description"], center["name"]);
      if (id && nome) nomes.set(id, nome);
    }
  }
  return nomes;
}

export function adaptarBaixasNibo(
  items: ApiRecord[],
  tipo: TipoLancamento,
  nomesCentros = new Map<string, string>(),
): NiboApiLinha[] {
  return items.flatMap((item, itemIndex) => {
    const id = obterIdOriginalNibo(item);
    if (!id) throw new Error(`Registro ${itemIndex + 1} do Nibo sem identificador original.`);
    const stakeholder = record(item["stakeholder"]);
    const account = record(item["account"]);
    const categories = array(item["categories"]);
    const singleCategory = record(item["category"]);
    const costCenters = array(item["costCenters"] ?? item["costcenters"]);
    const singleCostCenter = record(item["costCenter"]);
    const effectiveDate = date(item["date"] ?? item["paymentDate"] ?? item["receiptDate"]);
    if (!effectiveDate) throw new Error(`Registro Nibo ${id} sem data de baixa valida.`);
    const total = Math.abs(
      number(item["paidValue"], item["receivedValue"], item["value"], item["amount"]),
    );
    const categoryParts = categories.length
      ? categories
      : singleCategory && text(singleCategory["id"], singleCategory["name"])
        ? [{ ...singleCategory, value: total }]
        : [{ value: total }];
    const rawCategoryValues = categoryParts.map((category) => {
      const explicitValue = optionalNumber(category["value"]);
      return explicitValue === null ? null : Math.abs(explicitValue);
    });
    const explicitCategoryTotal = rawCategoryValues.reduce<number>(
      (sum, value) => sum + (value ?? 0),
      0,
    );
    const categoryValues = allocateMoney(
      total,
      explicitCategoryTotal > 0
        ? rawCategoryValues.map((value) => value ?? 0)
        : categoryParts.map(() => 1),
    );
    const centerParts = costCenters.length
      ? costCenters
      : singleCostCenter &&
          text(
            singleCostCenter["costCenterId"],
            singleCostCenter["id"],
            singleCostCenter["description"],
          )
        ? [singleCostCenter]
        : [{}];
    const percentTotal = centerParts.reduce(
      (sum, center) => sum + Math.abs(optionalNumber(center["percent"]) ?? 0),
      0,
    );
    const centerValueTotal = centerParts.reduce(
      (sum, center) => sum + Math.abs(optionalNumber(center["value"]) ?? 0),
      0,
    );
    const centerWeights = centerParts.map((center) => {
      if (centerParts.length === 1) return 1;
      if (percentTotal > 0) return Math.abs(optionalNumber(center["percent"]) ?? 0) / percentTotal;
      if (centerValueTotal > 0)
        return Math.abs(optionalNumber(center["value"]) ?? 0) / centerValueTotal;
      return 1 / centerParts.length;
    });

    return categoryParts.flatMap((category, categoryIndex) => {
      // Em baixas parciais o Nibo devolve nas categorias os valores originais
      // do titulo. O painel reaplica a proporcao desses rateios sobre o valor
      // efetivamente baixado; somar os valores brutos infla a DRE.
      const categoryValue = categoryValues[categoryIndex] ?? 0;
      const centerValues = allocateMoney(categoryValue, centerWeights);
      return centerParts.map((center, centerIndex) => {
        const allocated = centerValues[centerIndex] ?? 0;
        // O indice faz parte da identidade porque o payload real pode repetir a
        // mesma categoria/centro no mesmo titulo com valores diferentes.
        const externalId = [
          id,
          `cat:${text(category["id"], category["categoryId"]) || "none"}:${categoryIndex}`,
          `cc:${text(center["id"], center["costCenterId"]) || "none"}:${centerIndex}`,
        ].join(":");
        const categoria = text(category["categoryName"], category["name"], category["description"]);
        const pessoa = text(
          stakeholder?.["name"],
          item["stakeholderName"],
          item["supplierName"],
          item["customerName"],
        );
        const centerId = text(center["costCenterId"], center["id"]);
        const centro =
          text(center["costCenterDescription"], center["description"], center["name"]) ||
          nomesCentros.get(centerId) ||
          "";
        const descricao = text(item["description"], item["identifier"], item["reference"]);
        const signedValue = tipo === "paga" ? -Math.abs(allocated) : Math.abs(allocated);
        const linhaSemHash: Omit<NiboApiLinha, "hash"> = {
          tipo,
          data_efetiva: effectiveDate,
          // A DRE atual e a importacao por planilha trabalham em regime de caixa:
          // a competencia exibida deve acompanhar a data efetiva da baixa.
          competencia: `${effectiveDate.slice(0, 7)}-01`,
          descricao,
          categoria_nibo: categoria,
          pessoa,
          centro_custo: centro,
          conta_bancaria: text(account?.["name"], account?.["description"], item["accountName"]),
          valor: Number(signedValue.toFixed(2)),
          nibo_id: id,
          external_source: "nibo_api",
          external_id: externalId,
          // A versao faz alteracoes de regra do adapter dispararem update mesmo
          // quando o payload bruto do Nibo nao mudou.
          source_content_hash: stableHash({
            adapterVersion: 5,
            item,
            category,
            center,
            allocated,
            centro,
          }),
          reference: text(item["reference"]),
          cpf_cnpj: text(stakeholder?.["cpfCnpj"], item["cpfCnpj"]),
          categoria_pai: text(category["parent"], category["parentName"]),
          payload: item,
        };
        return { ...linhaSemHash, hash: `nibo_api|${externalId}` };
      });
    });
  });
}

export function adaptarAgendamentosAbertosNibo(
  items: ApiRecord[],
  tipo: TipoLancamento,
  hoje: string,
  nomesCentros = new Map<string, string>(),
): NiboApiTitulo[] {
  return items.map((item, index) => {
    const scheduleId = text(item["scheduleId"], item["id"]);
    if (!scheduleId) throw new Error(`Agendamento ${index + 1} do Nibo sem identificador.`);
    const dueDate = date(item["dueDate"]);
    if (!dueDate) throw new Error(`Agendamento Nibo ${scheduleId} sem vencimento valido.`);
    const projectedDate = date(item["scheduleDate"]) || dueDate;
    const accrualDate = date(item["accrualDate"]) || dueDate;
    const stakeholder = record(item["stakeholder"]);
    const categories = array(item["categories"]);
    const singleCategory = record(item["category"]);
    const costCenters = array(item["costCenters"] ?? item["costcenters"]);
    const singleCostCenter = record(item["costCenter"]);
    const openValue = optionalNumber(item["openValue"]);
    const value = Math.abs(openValue ?? number(item["value"]));
    const categoryNames = categories.length
      ? categories.map((category) => text(category["categoryName"], category["name"]))
      : [text(singleCategory?.["name"], singleCategory?.["categoryName"])];
    const centerNames = costCenters.length
      ? costCenters.map(
          (center) =>
            text(center["costCenterDescription"], center["description"], center["name"]) ||
            nomesCentros.get(text(center["costCenterId"], center["id"])) ||
            "",
        )
      : [
          text(singleCostCenter?.["description"], singleCostCenter?.["name"]) ||
            nomesCentros.get(text(singleCostCenter?.["costCenterId"], singleCostCenter?.["id"])) ||
            "",
        ];
    const externalId = `${tipo}:${scheduleId}`;
    return {
      tipo,
      vencimento: dueDate,
      data_projetada: projectedDate,
      competencia: `${accrualDate.slice(0, 7)}-01`,
      descricao: text(item["description"], item["reference"]),
      categoria_nibo: [...new Set(categoryNames.filter(Boolean))].join(" • "),
      pessoa: text(stakeholder?.["name"], item["stakeholderName"]),
      centro_custo: [...new Set(centerNames.filter(Boolean))].join(" • "),
      valor: Number(value.toFixed(2)),
      status: item["isDued"] === true || dueDate < hoje ? "vencido" : "aberto",
      hash: `nibo_api_fluxo|${externalId}`,
      external_id: externalId,
      source_content_hash: stableHash({ adapterVersion: 1, item, value }),
      payload: item,
    };
  });
}
