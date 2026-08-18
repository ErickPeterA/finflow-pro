import type { Page } from "playwright";
import { NiboSyncError } from "./errors";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function extractCompanyIdFromUrl(url: string): string | null {
  return url.match(UUID_RE)?.[0] ?? null;
}

export async function assertNiboCompany(page: Page, expectedCompanyId: string) {
  const currentCompanyId = extractCompanyIdFromUrl(page.url());
  if (currentCompanyId !== expectedCompanyId) {
    throw new NiboSyncError(
      `Empresa NIBO divergente. Esperado ${expectedCompanyId}, atual ${currentCompanyId ?? "indefinida"}.`,
      "NIBO_COMPANY_MISMATCH",
    );
  }
}
