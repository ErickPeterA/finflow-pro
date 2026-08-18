import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import type { NiboExportRequest, NiboExportResult } from "./types";
import { getNiboRuntimeConfig } from "./config";
import { assertNiboCompany } from "./company";
import { NiboSyncError } from "./errors";

const REPORT_BASE_URL = "https://empresa.nibo.com.br/Report";

function relatorioNibo(tipo: NiboExportRequest["tipo"]) {
  return tipo === "paga"
    ? { path: "DebitEntries", nome: "Contas Pagas", arquivo: "contas_pagas" }
    : { path: "CreditEntries", nome: "Contas Recebidas", arquivo: "contas_recebidas" };
}

function buildReportUrl(request: NiboExportRequest) {
  const relatorio = relatorioNibo(request.tipo);
  const url = new URL(`${REPORT_BASE_URL}/${relatorio.path}/${request.config.nibo_company_id}`);
  url.searchParams.set("isAccrual", "false");
  url.searchParams.set("endEntryDate", request.periodo.fim);
  url.searchParams.set("startEntryDate", request.periodo.inicio);
  url.searchParams.set("costCenterFilterType", "0");
  return url.toString();
}

function nomeArquivoDestino(request: NiboExportRequest) {
  const relatorio = relatorioNibo(request.tipo);
  const empresa = request.config.nibo_company_id;
  return `${relatorio.arquivo}_${empresa}_${request.periodo.inicio}_${request.periodo.fim}.xlsx`;
}

async function assertNaoEstaNaTelaDeLogin(page: Page) {
  const texto = await page
    .locator("body")
    .innerText({ timeout: 10_000 })
    .catch(() => "");
  if (/bem-vindo ao nibo|entrar com google|escolha uma conta/i.test(texto)) {
    throw new NiboSyncError(
      "Sessao NIBO expirada ou invalida. Rode npm run nibo:auth, faca login/2FA e salve um novo storageState.",
      "NIBO_AUTH_REQUIRED",
    );
  }
}

async function abrirMenuExportacao(page: Page) {
  const seletores = [
    '[title*="Baixar" i]',
    '[aria-label*="Baixar" i]',
    '[title*="Download" i]',
    '[aria-label*="Download" i]',
    '[title*="Export" i]',
    '[aria-label*="Export" i]',
    'button:has-text("Baixar")',
    'a:has-text("Baixar")',
    'button:has-text("Exportar")',
    'a:has-text("Exportar")',
    '[class*="download" i]',
    '[class*="export" i]',
    '[class*="cloud" i]',
  ];

  for (const seletor of seletores) {
    const alvo = page.locator(seletor).first();
    if ((await alvo.count()) === 0) continue;
    try {
      await alvo.click({ timeout: 2_000 });
      if (
        await page
          .getByText(/baixar em xls/i)
          .first()
          .isVisible({ timeout: 2_000 })
      )
        return;
    } catch {
      // Tenta o proximo seletor; o NIBO renderiza alguns icones sem nome acessivel.
    }
  }

  const competencia = page.getByText("Competência").first();
  const box = await competencia.boundingBox({ timeout: 5_000 }).catch(() => null);
  if (box) {
    await page.mouse.click(Math.max(20, box.x - 70), box.y + box.height / 2);
    if (
      await page
        .getByText(/baixar em xls/i)
        .first()
        .isVisible({ timeout: 3_000 })
    )
      return;
  }

  const viewport = page.viewportSize();
  if (viewport) {
    await page.mouse.click(viewport.width * 0.845, 128);
    if (
      await page
        .getByText(/baixar em xls/i)
        .first()
        .isVisible({ timeout: 3_000 })
    )
      return;
  }

  throw new NiboSyncError(
    "Nao foi possivel localizar o menu de exportacao XLS no relatorio NIBO.",
    "NIBO_EXPORT_MENU_NOT_FOUND",
  );
}

export async function exportNiboReport(
  page: Page,
  request: NiboExportRequest,
): Promise<NiboExportResult> {
  const runtime = getNiboRuntimeConfig();
  const relatorio = relatorioNibo(request.tipo);
  const url = buildReportUrl(request);

  await mkdir(runtime.downloadDir, { recursive: true });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await assertNaoEstaNaTelaDeLogin(page);
  await assertNiboCompany(page, request.config.nibo_company_id);
  await page
    .getByText(new RegExp(relatorio.nome, "i"))
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
  await page.getByText("Filtrar").first().waitFor({ state: "visible", timeout: 30_000 });

  await abrirMenuExportacao(page);
  const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
  await page
    .getByText(/baixar em xls/i)
    .first()
    .click({ timeout: 10_000 });
  const download = await downloadPromise;
  const filePath = path.join(runtime.downloadDir, nomeArquivoDestino(request));
  await download.saveAs(filePath);

  return { filePath, reportName: relatorio.nome };
}
