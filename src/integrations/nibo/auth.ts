import type { Page } from "playwright";
import type { NiboRuntimeConfig } from "./config";
import { NiboFlowNotMappedError } from "./errors";

export async function ensureNiboAuthenticated(page: Page, config: NiboRuntimeConfig) {
  await page.goto(config.baseUrl, { waitUntil: "domcontentloaded" });

  if (config.storageStatePath) {
    return;
  }

  throw new NiboFlowNotMappedError("autenticacao sem storageState confirmado");
}
