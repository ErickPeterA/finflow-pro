import type { Browser, BrowserContext, BrowserContextOptions, Page } from "playwright";
import { chromium } from "playwright";
import type { NiboRuntimeConfig } from "./config";

export interface NiboBrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

export async function openNiboBrowser(config: NiboRuntimeConfig): Promise<NiboBrowserSession> {
  const browser = await chromium.launch({ headless: config.headless });
  const contextOptions: BrowserContextOptions = {
    acceptDownloads: true,
    viewport: { width: 1366, height: 768 },
  };
  if (config.storageStatePath) contextOptions.storageState = config.storageStatePath;
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  return {
    browser,
    context,
    page,
    close: async () => {
      await context.close();
      await browser.close();
    },
  };
}
